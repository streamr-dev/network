import { EventEmitter } from 'eventemitter3'
import {
    ConnectivityResponse, DisconnectNotice,
    LockRequest,
    LockResponse,
    Message,
    MessageType,
    PeerDescriptor,
    UnlockRequest
} from '../proto/packages/dht/protos/DhtRpc'
import { WebSocketConnector } from './WebSocket/WebSocketConnector'
import { PeerIDKey } from '../helpers/PeerID'
import { protoToString } from '../helpers/protoToString'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { WebRtcConnector } from './WebRTC/WebRtcConnector'
import { CountMetric, LevelMetric, Logger, Metric, MetricsContext, MetricsDefinition, RateMetric } from '@streamr/utils'
import * as Err from '../helpers/errors'
import { WEB_RTC_CLEANUP } from './WebRTC/NodeWebRtcConnection'
import { ManagedConnection } from './ManagedConnection'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { ConnectionLockerClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { RemoteConnectionLocker } from './RemoteConnectionLocker'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Empty } from '../proto/google/protobuf/empty'
import { Simulator } from './Simulator/Simulator'
import { SimulatorConnector } from './Simulator/SimulatorConnector'
import { ConnectionLockHandler } from './ConnectionLockHandler'
import { SetDuplicateDetector } from '../dht/SetDuplicateDetector'
import { SortedContactList } from '../dht/contact/SortedContactList'
import { Contact } from '../dht/contact/Contact'
import {
    isSamePeerDescriptor,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../helpers/peerIdFromPeerDescriptor'

export class ConnectionManagerConfig {
    transportLayer?: ITransport
    webSocketHost?: string
    webSocketPort?: number
    entryPoints?: PeerDescriptor[]
    stunUrls?: string[]
    metricsContext?: MetricsContext
    nodeName?: string
    maxConnections: number = 80

    // the following fields are used in simulation only
    simulator?: Simulator
    ownPeerDescriptor?: PeerDescriptor
    serviceIdPrefix?: string

    constructor(conf: Partial<ConnectionManagerConfig>) {
        // assign given non-undefined config vars over defaults
        let k: keyof typeof conf
        for (k in conf) {
            if (conf[k] === undefined) {
                delete conf[k]
            }
        }
        Object.assign(this, conf)
    }
}

export enum NatType {
    OPEN_INTERNET = 'open_internet',
    UNKNOWN = 'unknown'
}

interface ConnectionManagerMetrics extends MetricsDefinition {
    sendMessagesPerSecond: Metric
    sendBytesPerSecond: Metric
    receiveMessagesPerSecond: Metric
    receiveBytesPerSecond: Metric
    connectionAverageCount: Metric
    connectionTotalFailureCount: Metric
}

type ServiceId = string

export type PeerDescriptorGeneratorCallback = (connectivityResponse: ConnectivityResponse) => PeerDescriptor

const logger = new Logger(module)

interface ConnectionManagerEvents {
    newConnection: (connection: ManagedConnection) => void
}

export interface ConnectionLocker {
    lockConnection(targetDescriptor: PeerDescriptor, serviceId: ServiceId): void
    unlockConnection(targetDescriptor: PeerDescriptor, serviceId: ServiceId): void
    weakLockConnection(targetDescriptor: PeerDescriptor): void
    weakUnlockConnection(targetDescriptor: PeerDescriptor): void
}

export type Events = TransportEvents & ConnectionManagerEvents

export class ConnectionManager extends EventEmitter<Events> implements ITransport, ConnectionLocker {
    public static PROTOCOL_VERSION = '1.0'
    private stopped = false
    private started = false

    private ownPeerDescriptor?: PeerDescriptor
    private connections: Map<PeerIDKey, ManagedConnection> = new Map()
    private readonly messageDuplicateDetector: SetDuplicateDetector = new SetDuplicateDetector(100000, 100)
    private readonly metricsContext: MetricsContext
    private readonly metrics: ConnectionManagerMetrics

    private webSocketConnector?: WebSocketConnector
    private webrtcConnector?: WebRtcConnector
    private simulatorConnector?: SimulatorConnector

    private serviceId: ServiceId
    private rpcCommunicator?: RoutingRpcCommunicator

    private locks = new ConnectionLockHandler()

    private disconnectorIntervalRef?: NodeJS.Timer

    private config: ConnectionManagerConfig

    constructor(conf: Partial<ConnectionManagerConfig>) {
        super()

        this.config = new ConnectionManagerConfig(conf)

        this.onData = this.onData.bind(this)
        this.incomingConnectionCallback = this.incomingConnectionCallback.bind(this)
        this.metricsContext = this.config.metricsContext || new MetricsContext()

        this.metrics = {
            sendMessagesPerSecond: new RateMetric(),
            sendBytesPerSecond: new RateMetric(),
            receiveMessagesPerSecond: new RateMetric(),
            receiveBytesPerSecond: new RateMetric(),
            connectionAverageCount: new LevelMetric(0),
            connectionTotalFailureCount: new CountMetric()
        }
        this.metricsContext.addMetrics('node', this.metrics)

        if (this.config.simulator) {
            logger.trace(`Creating SimulatorConnector`)
            this.simulatorConnector = new SimulatorConnector(ConnectionManager.PROTOCOL_VERSION,
                this.config.ownPeerDescriptor!, this.config.simulator, this.incomingConnectionCallback)

            this.config.simulator.addConnector(this.simulatorConnector)

            this.ownPeerDescriptor = this.config.ownPeerDescriptor

            this.started = true

        } else {
            logger.trace(`Creating WebSocketConnector`)
            this.webSocketConnector = new WebSocketConnector(ConnectionManager.PROTOCOL_VERSION, this.config.transportLayer!,
                this.canConnect.bind(this), this.incomingConnectionCallback, this.config.webSocketPort, this.config.webSocketHost,
                this.config.entryPoints)

            logger.trace(`Creating WebRTCConnector`)
            this.webrtcConnector = new WebRtcConnector({
                rpcTransport: this.config.transportLayer!,
                protocolVersion: ConnectionManager.PROTOCOL_VERSION,
                stunUrls: this.config.stunUrls
            }, this.incomingConnectionCallback)
        }

        this.serviceId = (this.config.serviceIdPrefix ? this.config.serviceIdPrefix : '') + 'ConnectionManager'
        this.send = this.send.bind(this)
        this.rpcCommunicator = new RoutingRpcCommunicator(this.serviceId, this.send, {
            rpcRequestTimeout: 10000
        })

        this.lockRequest = this.lockRequest.bind(this)
        this.unlockRequest = this.unlockRequest.bind(this)
        this.gracefulDisconnect = this.gracefulDisconnect.bind(this)

        this.rpcCommunicator.registerRpcMethod(LockRequest, LockResponse, 'lockRequest', this.lockRequest)
        this.rpcCommunicator.registerRpcNotification(UnlockRequest, 'unlockRequest', this.unlockRequest)
        this.rpcCommunicator.registerRpcNotification(DisconnectNotice, 'gracefulDisconnect', this.gracefulDisconnect)

        // Garbage collection of connections
        this.disconnectorIntervalRef = setInterval(() => {
            logger.trace('disconnectorInterval')
            const LAST_USED_LIMIT = 30000
            this.garbageCollectConnections(this.config.maxConnections, LAST_USED_LIMIT)
        }, 1000)
    }

    public garbageCollectConnections(maxConnections: number, lastUsedLimit: number): void {
        if (this.connections.size > maxConnections) {
            const disconnectionCandidates = new SortedContactList(peerIdFromPeerDescriptor(this.ownPeerDescriptor!), 100000)

            this.connections.forEach((connection) => {
                if (!this.locks.isLocked(connection.peerIdKey) && Date.now() - connection.getLastUsed() > lastUsedLimit) {
                    logger.trace("disconnecting in timeout interval: " + this.config.nodeName + ', ' +
                    connection.getPeerDescriptor()?.nodeName + ' ')

                    disconnectionCandidates.addContact(new Contact(connection.getPeerDescriptor()!))
                }
            })

            const sortedCandidates = disconnectionCandidates.getAllContacts()
            const targetNum = this.connections.size - maxConnections

            for (let i = 0; i < sortedCandidates.length && i < targetNum; i++) {
                logger.trace(this.config.nodeName + ' garbageCollecting ' +
                    sortedCandidates[sortedCandidates.length - 1 - i].getPeerDescriptor().nodeName)
                this.gracefullyDisconnectAsync(sortedCandidates[sortedCandidates.length - 1 - i].getPeerDescriptor()).catch((_e) => { })
            }
        }
    }

    public async start(peerDescriptorGeneratorCallback?: PeerDescriptorGeneratorCallback): Promise<void> {
        if (this.started || this.stopped) {
            throw new Err.CouldNotStart(`Cannot start already ${this.started ? 'started' : 'stopped'} module`)
        }
        this.started = true
        logger.trace(`Starting ConnectionManager...`)

        if (!this.config.simulator) {
            await this.webSocketConnector!.start()

            const connectivityResponse = await this.webSocketConnector!.checkConnectivity()

            const ownPeerDescriptor = peerDescriptorGeneratorCallback!(connectivityResponse)
            this.ownPeerDescriptor = ownPeerDescriptor

            this.webSocketConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
            this.webrtcConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
        }
    }

    public async stop(): Promise<void> {
        if (!this.started || this.stopped) {
            return
        }
        logger.trace(`Stopping ConnectionManager`)

        this.stopped = true

        if (this.disconnectorIntervalRef) {
            clearInterval(this.disconnectorIntervalRef)
        }

        logger.trace('stopping connections')
        await Promise.allSettled([...this.connections.values()].map((connection: ManagedConnection) => {
            return this.gracefullyDisconnectAsync(connection.getPeerDescriptor()!)
        }))
        logger.trace('stopped connections')

        this.rpcCommunicator!.stop()

        if (!this.config.simulator) {
            await this.webSocketConnector!.stop()
            await this.webrtcConnector!.stop()
            WEB_RTC_CLEANUP.cleanUp()
        } else {
            await this.simulatorConnector!.stop()
        }
    }

    public getConnectionTo(id: PeerIDKey): ManagedConnection {
        return this.connections.get(id)!
    }
    public getNumberOfLocalLockedConnections(): number {
        return this.locks.getNumberOfLocalLockedConnections()
    }

    public getNumberOfRemoteLockedConnections(): number {
        return this.locks.getNumberOfRemoteLockedConnections()
    }

    public getNumberOfWeakLockedConnections(): number {
        return this.locks.getNumberOfWeakLockedConnections()
    }

    public send = async (message: Message, doNotConnect?: boolean): Promise<void> => {
        if (!this.started || this.stopped) {
            return
        }
        const peerDescriptor = message.targetDescriptor!

        const hexId = keyFromPeerDescriptor(peerDescriptor)
        if (isSamePeerDescriptor(peerDescriptor, this.ownPeerDescriptor!)) {
            throw new Err.CannotConnectToSelf('Cannot send to self')
        }
        logger.trace(`Sending message to: ${peerDescriptor.kademliaId.toString()}`)

        if (!(message.targetDescriptor)) {
            message = ({ ...message, targetDescriptor: peerDescriptor })
        }

        if (!(message.sourceDescriptor)) {
            message = ({ ...message, sourceDescriptor: this.ownPeerDescriptor })
        }

        let connection: ManagedConnection | undefined

        if (this.connections.has(hexId)) {
            connection = this.connections.get(hexId)
        } else if (!doNotConnect) {

            if (this.simulatorConnector) {
                connection = this.simulatorConnector!.connect(peerDescriptor)
            } else if (peerDescriptor.websocket || this.ownPeerDescriptor!.websocket) {
                connection = this.webSocketConnector!.connect(peerDescriptor)
            } else {
                connection = this.webrtcConnector!.connect(peerDescriptor)
            }

            this.incomingConnectionCallback(connection)
            //await this.onNewConnection(connection)
        } else {
            throw (new Err.SendFailed('No connection to target, doNotConnect flag is true'))
        }
        const binary = Message.toBinary(message)

        this.metrics.sendBytesPerSecond.record(binary.byteLength)
        this.metrics.sendMessagesPerSecond.record(1)
        return connection!.send(binary)
    }

    public getConnection(peerDescriptor: PeerDescriptor): ManagedConnection | undefined {
        const hexId = keyFromPeerDescriptor(peerDescriptor)
        return this.connections.get(hexId)
    }

    public getPeerDescriptor(): PeerDescriptor {
        return this.ownPeerDescriptor!
    }

    public hasConnection(peerDescriptor: PeerDescriptor): boolean {
        const hexId = keyFromPeerDescriptor(peerDescriptor)
        return this.connections.has(hexId)
    }

    public hasLocalLockedConnection(peerDescriptor: PeerDescriptor, _serviceId?: ServiceId): boolean {
        const hexId = keyFromPeerDescriptor(peerDescriptor)
        return this.locks.isLocalLocked(hexId)
    }

    public hasRemoteLockedConnection(peerDescriptor: PeerDescriptor, _serviceId?: ServiceId): boolean {
        const hexId = keyFromPeerDescriptor(peerDescriptor)
        return this.locks.isRemoteLocked(hexId)
    }

    public canConnect(peerDescriptor: PeerDescriptor, _ip: string, _port: number): boolean {
        // Perhaps the connection's state should be checked here
        return !this.hasConnection(peerDescriptor) // TODO: Add port range check
    }

    public handleMessage(message: Message): void {
        logger.trace('Received message of type ' + message!.messageType)

        if (message!.messageType !== MessageType.RPC) {
            logger.trace('Filtered out non-RPC message of type ' + message!.messageType)
            return
        }

        if (this.messageDuplicateDetector.isMostLikelyDuplicate(message.messageId, message.sourceDescriptor!.nodeName!, message)) {
            logger.trace('handleMessage filtered duplicate ' + this.config.nodeName + ', ' +
                message.sourceDescriptor?.nodeName + ' ' + message.serviceId + ' ' + message.messageId)
            return
        }

        this.messageDuplicateDetector.add(message.messageId, message.sourceDescriptor!.nodeName!, message)

        if (message.serviceId == this.serviceId) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } else {
            logger.trace('emit "message" ' + this.config.nodeName + ', ' + message.sourceDescriptor?.nodeName +
                ' ' + message.serviceId + ' ' + message.messageId)
            this.emit('message', message)
        }
    }

    private onData(data: Uint8Array, peerDescriptor: PeerDescriptor): void {
        // This method parsed incoming data to Messages
        // and ensures they are meant to us
        // ToDo: add signature checking and decryption here

        if (!this.started || this.stopped) {
            return
        }

        this.metrics.receiveBytesPerSecond.record(data.byteLength)
        this.metrics.receiveMessagesPerSecond.record(1)
        try {
            let message: Message | undefined
            try {
                message = Message.fromBinary(data)

                logger.trace(this.config.nodeName + ' received protojson: ' + protoToString(message, Message))
            } catch (e1) {
                logger.debug('Parsing incoming data into Message failed' + e1)
                return
            }

            message.sourceDescriptor = peerDescriptor
            this.handleMessage(message)

        } catch (e) {
            logger.debug('Handling incoming data failed ' + e)
        }
    }

    private onConnected = (connection: ManagedConnection) => {
        const peerDescriptor = connection.getPeerDescriptor()!
        this.emit('connected', peerDescriptor)
        logger.trace(
            'connectedPeerId: '
            + peerIdFromPeerDescriptor(peerDescriptor).toString()
            + ', ' + peerIdFromPeerDescriptor(this.ownPeerDescriptor!).toString()
            + ', ' + this.connections.size
        )
        this.onConnectionCountChange()
    }

    private onDisconnected = (connection: ManagedConnection) => {
        if (!this.started || this.stopped) {
            return
        }

        logger.trace(this.config.nodeName + ' onDisconnected()')

        const hexKey = keyFromPeerDescriptor(connection.getPeerDescriptor()!)
        const storedConnection = this.connections.get(hexKey)

        if (storedConnection && storedConnection.connectionId.equals(connection.connectionId)) {
            this.locks.clearAllLocks(hexKey)
            this.connections.delete(hexKey)
            this.emit('disconnected', connection.getPeerDescriptor()!)
            this.onConnectionCountChange()
        } else {
            logger.trace(this.config.nodeName + 'onDisconnected() did nothing, no such connection in connectionManager')
        }

    }

    private incomingConnectionCallback(connection: ManagedConnection): boolean {
        if (!this.started || this.stopped) {
            return false
        }
        logger.trace('incomingConnectionCallback() objectId ' + connection.objectId)

        connection.offeredAsIncoming = true

        const newPeerID = peerIdFromPeerDescriptor(connection.getPeerDescriptor()!)
        if (this.connections.has(newPeerID.toKey())) {
            if (newPeerID.hasSmallerHashThan(peerIdFromPeerDescriptor(this.ownPeerDescriptor!))) {

                // replace the current connection

                const oldConnection = this.connections.get(newPeerID.toKey())!
                logger.trace("replaced: " + this.config.nodeName + ', ' + connection.getPeerDescriptor()?.nodeName + ' ')

                const buffer = oldConnection!.stealOutputBuffer()

                for (const data of buffer) {
                    connection.sendNoWait(data)
                }
                oldConnection!.reportBufferSentByOtherConnection()

            } else {
                connection.rejectedAsIncoming = true
                return false
            }
        }

        connection.on('managedData', this.onData)

        if (connection.isHandshakeCompleted()) {
            this.onConnected(connection)
        } else {
            connection.once('handshakeCompleted', (_peerDescriptor: PeerDescriptor) => {
                this.onConnected(connection)
            })
        }
        connection.on('disconnected', (_code?: number, _reason?: string) => {
            this.onDisconnected(connection)
        })

        const hexKey = keyFromPeerDescriptor(connection.getPeerDescriptor()!)
        if (this.connections.has(hexKey)) {
            this.connections.get(hexKey)!.replacedByOtherConnection = true
        }
        this.connections.set(hexKey, connection)

        this.emit('newConnection', connection)
        return true
    }

    private async closeConnection(id: PeerIDKey, reason?: string): Promise<void> {

        this.locks.clearAllLocks(id)

        if (this.connections.has(id)) {
            logger.trace(`Closeconnection called to Peer ${id}${reason ? `: ${reason}` : ''}`)

            const connectionToClose = this.connections.get(id)!
            logger.trace("disconnecting: " + this.config.nodeName + ", " + connectionToClose.getPeerDescriptor()?.nodeName)

            await connectionToClose.close()
        }
    }

    /*
    private clearDisconnectionTimeout(hexId: PeerIDKey): void {
        if (this.disconnectionTimeouts.has(hexId)) {
            clearTimeout(this.disconnectionTimeouts.get(hexId))
            this.disconnectionTimeouts.delete(hexId)
        }
    }
    */

    public lockConnection(targetDescriptor: PeerDescriptor, serviceId: ServiceId): void {
        if (this.stopped || isSamePeerDescriptor(targetDescriptor, this.ownPeerDescriptor!)) {
            return
        }
        const hexKey = keyFromPeerDescriptor(targetDescriptor)
        //this.clearDisconnectionTimeout(hexKey)
        const remoteConnectionLocker = new RemoteConnectionLocker(
            this.ownPeerDescriptor!,
            targetDescriptor,
            ConnectionManager.PROTOCOL_VERSION,
            toProtoRpcClient(new ConnectionLockerClient(this.rpcCommunicator!.getRpcClientTransport()))
        )

        this.locks.addLocalLocked(hexKey, serviceId)

        remoteConnectionLocker.lockRequest(serviceId)
            .then((_accepted) => logger.trace('LockRequest successful'))
            .catch((err) => { logger.debug(err) })
    }

    public unlockConnection(targetDescriptor: PeerDescriptor, serviceId: ServiceId): void {
        if (this.stopped || isSamePeerDescriptor(targetDescriptor, this.ownPeerDescriptor!)) {
            return
        }

        const hexKey = keyFromPeerDescriptor(targetDescriptor)

        this.locks.removeLocalLocked(hexKey, serviceId)

        const remoteConnectionLocker = new RemoteConnectionLocker(
            this.ownPeerDescriptor!,
            targetDescriptor,
            ConnectionManager.PROTOCOL_VERSION,
            toProtoRpcClient(new ConnectionLockerClient(this.rpcCommunicator!.getRpcClientTransport()))
        )

        if (this.connections.has(hexKey)) {
            remoteConnectionLocker.unlockRequest(serviceId)
        }
    }

    public weakLockConnection(targetDescriptor: PeerDescriptor): void {
        if (this.stopped || isSamePeerDescriptor(targetDescriptor, this.ownPeerDescriptor!)) {
            return
        }

        const hexKey = keyFromPeerDescriptor(targetDescriptor)
        this.locks.addWeakLocked(hexKey)
    }

    public weakUnlockConnection(targetDescriptor: PeerDescriptor): void {
        if (this.stopped || isSamePeerDescriptor(targetDescriptor, this.ownPeerDescriptor!)) {
            return
        }

        const hexKey = keyFromPeerDescriptor(targetDescriptor)
        this.locks.removeWeakLocked(hexKey)

    }

    private async gracefullyDisconnectAsync(targetDescriptor: PeerDescriptor): Promise<void> {
        logger.trace('gracefullyDisconnectAsync()')
        const hexKey = keyFromPeerDescriptor(targetDescriptor)
        const remoteConnectionLocker = new RemoteConnectionLocker(
            this.ownPeerDescriptor!,
            targetDescriptor,
            ConnectionManager.PROTOCOL_VERSION,
            toProtoRpcClient(new ConnectionLockerClient(this.rpcCommunicator!.getRpcClientTransport()))
        )

        await remoteConnectionLocker.gracefulDisconnect()
        try {
            await this.closeConnection(hexKey)
        } catch (e) {
            logger.trace(e)
        }
    }

    public getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        return Array.from(this.connections.values())
            .filter((managedConnection: ManagedConnection) => managedConnection.isHandshakeCompleted())
            .map((managedConnection: ManagedConnection) => managedConnection.getPeerDescriptor()! as PeerDescriptor)
    }

    // IConnectionLocker server implementation
    private async lockRequest(lockRequest: LockRequest, _context: ServerCallContext): Promise<LockResponse> {
        const remotePeerId = peerIdFromPeerDescriptor(lockRequest.peerDescriptor!)
        if (isSamePeerDescriptor(lockRequest.peerDescriptor!, this.ownPeerDescriptor!)) {
            const response: LockResponse = {
                accepted: false
            }
            return response
        }

        this.locks.addRemoteLocked(remotePeerId.toKey(), lockRequest.serviceId)

        const response: LockResponse = {
            accepted: true
        }
        return response
    }

    // IConnectionLocker server implementation
    private async unlockRequest(unlockRequest: UnlockRequest, _context: ServerCallContext): Promise<Empty> {
        const hexKey = keyFromPeerDescriptor(unlockRequest.peerDescriptor!)

        this.locks.removeRemoteLocked(hexKey, unlockRequest.serviceId)

        return {}
    }

    // IConnectionLocker server implementation
    private async gracefulDisconnect(disconnectNotice: DisconnectNotice, _context: ServerCallContext): Promise<Empty> {
        const hexKey = keyFromPeerDescriptor(disconnectNotice.peerDescriptor!)

        logger.trace(' ' + this.config.nodeName + ', ' + disconnectNotice.peerDescriptor?.nodeName +
            ' calling closeConnection after receiving incoming gracefulDisconnect notice')
        await this.closeConnection(hexKey, 'graceful disconnect notified')
        return {}
    }

    private onConnectionCountChange() {
        this.metrics.connectionAverageCount.record(this.connections.size)
    }
}
