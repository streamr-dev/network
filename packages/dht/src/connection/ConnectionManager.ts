import { EventEmitter } from 'eventemitter3'
import {
    ConnectivityResponse,
    DisconnectMode,
    DisconnectNotice,
    DisconnectNoticeResponse,
    LockRequest,
    LockResponse,
    Message,
    MessageType,
    NodeType,
    PeerDescriptor,
    UnlockRequest
} from '../proto/packages/dht/protos/DhtRpc'
import { WebSocketConnector } from './WebSocket/WebSocketConnector'
import { PeerIDKey } from '../helpers/PeerID'
import { protoToString } from '../helpers/protoToString'
import { DisconnectionType, ITransport, TransportEvents } from '../transport/ITransport'
import { IceServer, WebRtcConnector } from './WebRTC/WebRtcConnector'
import { CountMetric, LevelMetric, Logger, Metric, MetricsContext, MetricsDefinition, RateMetric, waitForEvent3 } from '@streamr/utils'
import * as Err from '../helpers/errors'
import { WEB_RTC_CLEANUP } from './WebRTC/NodeWebRtcConnection'
import { ManagedConnection, Events as ManagedConnectionEvents } from './ManagedConnection'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { ConnectionLockerClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { RemoteConnectionLocker } from './RemoteConnectionLocker'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Empty } from '../proto/google/protobuf/empty'
import { Simulator } from './Simulator/Simulator'
import { SimulatorConnector } from './Simulator/SimulatorConnector'
import { ConnectionLockHandler } from './ConnectionLockHandler'
import { DuplicateDetector } from '../dht/routing/DuplicateDetector'
import { SortedContactList } from '../dht/contact/SortedContactList'
import { Contact } from '../dht/contact/Contact'
import {
    isSamePeerDescriptor,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../helpers/peerIdFromPeerDescriptor'
import { ListeningRpcCommunicator } from '../transport/ListeningRpcCommunicator'
import { AUTOCERTIFIER_SERVICE_ID } from '@streamr/autocertifier-client'
import { isPrivateIPv4 } from '../helpers/AddressTools'

export class ConnectionManagerConfig {
    transportLayer?: ITransport
    websocketHost?: string
    websocketPortRange?: PortRange
    entryPoints?: PeerDescriptor[]
    maxConnections: number = 80
    iceServers?: IceServer[]
    metricsContext?: MetricsContext
    webrtcAllowPrivateAddresses?: boolean
    webrtcDatachannelBufferThresholdLow?: number
    webrtcDatachannelBufferThresholdHigh?: number
    webrtcNewConnectionTimeout?: number
    maxMessageSize?: number
    externalIp?: string
    webrtcPortRange?: PortRange
    websocketServerEnableTls?: boolean
    tlsCertificate?: TlsCertificate
    autocertifierUrl?: string = 'https://ns1.fe6a54d8-8d6f-4743-890d-e9ecd680a4c7.xyz:59833'
    autocertifiedSubdomainFilePath?: string = '~/.streamr/subdomain.json'

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

enum ConnectionManagerState {
    IDLE = 'idle',
    RUNNING = 'running',
    STOPPING = 'stopping',
    STOPPED = 'stopped'
}

interface ConnectionManagerEvents {
    newConnection: (connection: ManagedConnection) => void
}

export interface ConnectionLocker {
    lockConnection(targetDescriptor: PeerDescriptor, serviceId: ServiceId): void
    unlockConnection(targetDescriptor: PeerDescriptor, serviceId: ServiceId): void
    weakLockConnection(targetDescriptor: PeerDescriptor): void
    weakUnlockConnection(targetDescriptor: PeerDescriptor): void
}

export interface PortRange {
    min: number
    max: number
}

export interface TlsCertificate {
    privateKeyFileName: string
    certFileName: string
}

export type Events = TransportEvents & ConnectionManagerEvents

// Form an string representation from a peer description which can be undefined. This output 
// should only be used only for log output. TODO remove this method if we no longer use
// peerDescriptors which can be undefined, e.g.
// - if we refactor ConnectionManager so that it doesn't process handshake requests too early 
//   and therefore this.ownPeerDescriptor can't be undefine (NET-1129)
// - if the peerDescriptor of ManagedConnection is always available
// - if we create stricter types for incoming messages (message.sourceDescriptor or
//   disconnectNotice.peerDescriptor)
// - if ManagedConnection#peerDescriptor is never undefined
export const keyOrUnknownFromPeerDescriptor = (peerDescriptor: PeerDescriptor | undefined): string => { 
    if (peerDescriptor !== undefined) {
        return keyFromPeerDescriptor(peerDescriptor)
    } else {
        return 'unknown'
    }
}

export class ConnectionManager extends EventEmitter<Events> implements ITransport, ConnectionLocker {
    public static PROTOCOL_VERSION = '1.0'
    private config: ConnectionManagerConfig
    private readonly metricsContext: MetricsContext
    private ownPeerDescriptor?: PeerDescriptor
    private readonly duplicateMessageDetector: DuplicateDetector = new DuplicateDetector(100000, 100)
    private readonly metrics: ConnectionManagerMetrics
    private locks = new ConnectionLockHandler()
    private connections: Map<PeerIDKey, ManagedConnection> = new Map()
    private webSocketConnector?: WebSocketConnector
    private webrtcConnector?: WebRtcConnector
    private simulatorConnector?: SimulatorConnector
    private rpcCommunicator?: RoutingRpcCommunicator
    private disconnectorIntervalRef?: NodeJS.Timeout
    private serviceId: ServiceId
    private state = ConnectionManagerState.IDLE

    constructor(conf: Partial<ConnectionManagerConfig>) {
        super()
        this.config = new ConnectionManagerConfig(conf)
        this.onData = this.onData.bind(this)
        this.send = this.send.bind(this)
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
            this.simulatorConnector = new SimulatorConnector(
                ConnectionManager.PROTOCOL_VERSION,
                this.config.ownPeerDescriptor!,
                this.config.simulator,
                this.incomingConnectionCallback
            )
            this.config.simulator.addConnector(this.simulatorConnector)
            this.ownPeerDescriptor = this.config.ownPeerDescriptor
            this.state = ConnectionManagerState.RUNNING
        } else {
            logger.trace(`Creating WebSocketConnector`)
            const autocertifierRpcCommunicator = new ListeningRpcCommunicator(AUTOCERTIFIER_SERVICE_ID, this)
            this.webSocketConnector = new WebSocketConnector({
                protocolVersion: ConnectionManager.PROTOCOL_VERSION,
                rpcTransport: this.config.transportLayer!,
                canConnect: this.canConnect.bind(this),
                autocertifierRpcCommunicator,
                autocertifierUrl: this.config.autocertifierUrl!,
                autocertifiedSubdomainFilePath: this.config.autocertifiedSubdomainFilePath!,
                serverEnableTls: this.config.websocketServerEnableTls!,
                incomingConnectionCallback: this.incomingConnectionCallback,
                portRange: this.config.websocketPortRange,
                host: this.config.websocketHost,
                entrypoints: this.config.entryPoints,
                tlsCertificate: this.config.tlsCertificate,
                maxMessageSize: this.config.maxMessageSize,
            })
            logger.trace(`Creating WebRTCConnector`)
            this.webrtcConnector = new WebRtcConnector({
                rpcTransport: this.config.transportLayer!,
                protocolVersion: ConnectionManager.PROTOCOL_VERSION,
                iceServers: this.config.iceServers,
                allowPrivateAddresses: this.config.webrtcAllowPrivateAddresses,
                bufferThresholdLow: this.config.webrtcDatachannelBufferThresholdLow,
                bufferThresholdHigh: this.config.webrtcDatachannelBufferThresholdHigh,
                maxMessageSize: this.config.maxMessageSize,
                connectionTimeout: this.config.webrtcNewConnectionTimeout,
                externalIp: this.config.externalIp,
                portRange: this.config.webrtcPortRange
            }, this.incomingConnectionCallback)
        }
        this.serviceId = (this.config.serviceIdPrefix ? this.config.serviceIdPrefix : '') + 'ConnectionManager'
        this.rpcCommunicator = new RoutingRpcCommunicator(this.serviceId, this.send, {
            rpcRequestTimeout: 10000
        })
        this.rpcCommunicator.registerRpcMethod(LockRequest, LockResponse, 'lockRequest',
            (req: LockRequest, context) => this.lockRequest(req, context))
        this.rpcCommunicator.registerRpcNotification(UnlockRequest, 'unlockRequest',
            (req: UnlockRequest, context) => this.unlockRequest(req, context))
        this.rpcCommunicator.registerRpcMethod(DisconnectNotice, DisconnectNoticeResponse, 'gracefulDisconnect',
            (req: DisconnectNotice, context) => this.gracefulDisconnect(req, context))
    }

    public garbageCollectConnections(maxConnections: number, lastUsedLimit: number): void {
        if (this.connections.size <= maxConnections) {
            return
        }
        const disconnectionCandidates = new SortedContactList<Contact>(peerIdFromPeerDescriptor(this.ownPeerDescriptor!), 100000)
        this.connections.forEach((connection) => {
            if (!this.locks.isLocked(connection.peerIdKey) && Date.now() - connection.getLastUsed() > lastUsedLimit) {
                logger.trace('disconnecting in timeout interval: ' + keyOrUnknownFromPeerDescriptor(connection.getPeerDescriptor()))
                disconnectionCandidates.addContact(new Contact(connection.getPeerDescriptor()!))
            }
        })
        const sortedCandidates = disconnectionCandidates.getAllContacts()
        const targetNum = this.connections.size - maxConnections
        for (let i = 0; i < sortedCandidates.length && i < targetNum; i++) {
            logger.trace('garbageCollecting ' + keyFromPeerDescriptor(sortedCandidates[sortedCandidates.length - 1 - i].getPeerDescriptor()))
            this.gracefullyDisconnectAsync(sortedCandidates[sortedCandidates.length - 1 - i].getPeerDescriptor(),
                DisconnectMode.NORMAL).catch((_e) => { })
        }
    }

    public async start(peerDescriptorGeneratorCallback: PeerDescriptorGeneratorCallback): Promise<void> {
        if (this.state === ConnectionManagerState.RUNNING || this.state === ConnectionManagerState.STOPPED) {
            throw new Err.CouldNotStart(`Cannot start already ${this.state} module`)
        }
        this.state = ConnectionManagerState.RUNNING
        logger.trace(`Starting ConnectionManager...`)
        // Garbage collection of connections
        this.disconnectorIntervalRef = setInterval(() => {
            logger.trace('disconnectorInterval')
            const LAST_USED_LIMIT = 20000
            this.garbageCollectConnections(this.config.maxConnections, LAST_USED_LIMIT)
        }, 5000)
        if (!this.config.simulator) {
            await this.webSocketConnector!.start()
            const selfSigned = (!this.config.tlsCertificate && this.config.websocketServerEnableTls === true)
            const connectivityResponse = await this.webSocketConnector!.checkConnectivity(selfSigned)
            let ownPeerDescriptor = peerDescriptorGeneratorCallback(connectivityResponse)
            this.ownPeerDescriptor = ownPeerDescriptor
            this.webSocketConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
            if (ownPeerDescriptor.websocket && !this.config.tlsCertificate && this.config.websocketServerEnableTls) {
                try {
                    ownPeerDescriptor = await this.autoCertify(peerDescriptorGeneratorCallback)
                } catch (err) {
                    connectivityResponse.websocket = undefined
                    ownPeerDescriptor = peerDescriptorGeneratorCallback(connectivityResponse)
                    this.ownPeerDescriptor = ownPeerDescriptor
                    logger.warn('Failed to autocertify, disabling websocket server connectivity')
                }
            }
            this.webrtcConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
        }
    }

    private async autoCertify(peerDescriptorGeneratorCallback: PeerDescriptorGeneratorCallback): Promise<PeerDescriptor> {
        await this.webSocketConnector!.autoCertify()
        const autoCertifiedConnectivityResponse = await this.webSocketConnector!.checkConnectivity(false)
        if (autoCertifiedConnectivityResponse.websocket) {
            const ownPeerDescriptor = peerDescriptorGeneratorCallback(autoCertifiedConnectivityResponse)
            this.ownPeerDescriptor = ownPeerDescriptor
            this.webSocketConnector!.setOwnPeerDescriptor(ownPeerDescriptor)
            return ownPeerDescriptor
        } else {
            logger.warn('ConnectivityCheck failed after autocertification, disabling websocket server connectivity')
            const ownPeerDescriptor = peerDescriptorGeneratorCallback(autoCertifiedConnectivityResponse)
            this.ownPeerDescriptor = ownPeerDescriptor
            return ownPeerDescriptor
        }
    }

    public async stop(): Promise<void> {
        if (this.state === ConnectionManagerState.STOPPED || this.state === ConnectionManagerState.STOPPING) {
            return
        }
        this.state = ConnectionManagerState.STOPPING
        logger.trace(`Stopping ConnectionManager`)
        if (this.disconnectorIntervalRef) {
            clearInterval(this.disconnectorIntervalRef)
        }
        if (!this.config.simulator) {
            await this.webSocketConnector!.destroy()
            this.webSocketConnector = undefined
            await this.webrtcConnector!.stop()
            this.webrtcConnector = undefined
        } else {
            await this.simulatorConnector!.stop()
            this.simulatorConnector = undefined
        }

        await Promise.all(Array.from(this.connections.values()).map(async (peer) => {
            if (peer.isHandshakeCompleted()) {
                try {
                    await this.gracefullyDisconnectAsync(peer.getPeerDescriptor()!, DisconnectMode.LEAVING)
                } catch (e) {
                    logger.error(e)
                }
            } else {
                logger.trace('handshake of connection not completed, force-closing')
                const eventReceived = waitForEvent3<ManagedConnectionEvents>(peer, 'disconnected', 2000)
                peer.close('OTHER')
                try {
                    await eventReceived
                    logger.trace('resolving after receiving disconnected event from non-handshaked connection')
                } catch (e) {
                    logger.trace('force-closing non-handshaked connection timed out ' + e)
                }
            }
        }))

        this.state = ConnectionManagerState.STOPPED
        this.rpcCommunicator!.stop()
        this.config.transportLayer = undefined
        this.duplicateMessageDetector.clear()
        this.locks.clear()
        this.removeAllListeners()
        if (!this.config.simulator) {

            WEB_RTC_CLEANUP.cleanUp()
        }
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

    public async send(message: Message, doNotConnect = false, doNotMindStopped = false): Promise<void> {
        if (this.state === ConnectionManagerState.STOPPED && !doNotMindStopped) {
            return
        }
        const peerDescriptor = message.targetDescriptor!
        if (this.isConnectionToSelf(peerDescriptor)) {
            throw new Err.CannotConnectToSelf('Cannot send to self')
        }
        logger.trace(`Sending message to: ${keyFromPeerDescriptor(peerDescriptor)}`)
        message = {
            ...message,
            targetDescriptor: message.targetDescriptor || peerDescriptor,
            sourceDescriptor: message.sourceDescriptor || this.ownPeerDescriptor,
        }
        const hexId = keyFromPeerDescriptor(peerDescriptor)
        let connection = this.connections.get(hexId)
        if (!connection && !doNotConnect) {
            connection = this.createConnection(peerDescriptor)
            this.incomingConnectionCallback(connection)
        } else if (!connection) {
            throw new Err.SendFailed('No connection to target, doNotConnect flag is true')
        }
        const binary = Message.toBinary(message)
        this.metrics.sendBytesPerSecond.record(binary.byteLength)
        this.metrics.sendMessagesPerSecond.record(1)
        return connection.send(binary, doNotConnect)
    }

    private isConnectionToSelf(peerDescriptor: PeerDescriptor): boolean { 
        return isSamePeerDescriptor(peerDescriptor, this.ownPeerDescriptor!) || this.isOwnWebSocketServer(peerDescriptor)
    }

    private isOwnWebSocketServer(peerDescriptor: PeerDescriptor): boolean {
        if ((peerDescriptor.websocket !== undefined) && (this.ownPeerDescriptor!.websocket !== undefined)) {
            return ((peerDescriptor.websocket.port === this.ownPeerDescriptor!.websocket.port) 
                && (peerDescriptor.websocket.host === this.ownPeerDescriptor!.websocket.host))
        } else {
            return false
        }
    }

    private createConnection(peerDescriptor: PeerDescriptor): ManagedConnection {
        if (this.simulatorConnector) {
            return this.simulatorConnector.connect(peerDescriptor)
        } else if ((peerDescriptor.websocket || this.ownPeerDescriptor!.websocket)) {
            if (this.canOpenWsConnection(peerDescriptor)) {
                return this.webSocketConnector!.connect(peerDescriptor)
            }
        }
        return this.webrtcConnector!.connect(peerDescriptor)
    }

    private canOpenWsConnection(peerDescriptor: PeerDescriptor): boolean {
        if (!(this.ownPeerDescriptor!.type === NodeType.BROWSER || peerDescriptor.type === NodeType.BROWSER)) {
            return true
        }
        if (this.ownPeerDescriptor!.websocket) {
            return (peerDescriptor.type === NodeType.BROWSER && this.ownPeerDescriptor!.websocket!.tls) 
                || (this.ownPeerDescriptor!.websocket!.host === 'localhost' || (isPrivateIPv4(this.ownPeerDescriptor!.websocket!.host)))
        }
        return (this.ownPeerDescriptor!.type === NodeType.BROWSER && peerDescriptor.websocket!.tls)
            || (peerDescriptor.websocket!.host === 'localhost' || (isPrivateIPv4(peerDescriptor.websocket!.host)))
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

    private canConnect(peerDescriptor: PeerDescriptor, _ip: string, _port: number): boolean {
        // Perhaps the connection's state should be checked here
        return !this.hasConnection(peerDescriptor) // TODO: Add port range check
    }

    public handleMessage(message: Message): void {
        logger.trace('Received message of type ' + message.messageType)
        if (message.messageType !== MessageType.RPC) {
            logger.trace('Filtered out non-RPC message of type ' + message.messageType)
            return
        }
        if (this.duplicateMessageDetector.isMostLikelyDuplicate(message.messageId)) {
            logger.trace('handleMessage filtered duplicate ' + keyFromPeerDescriptor(message.sourceDescriptor!) 
                + ' ' + message.serviceId + ' ' + message.messageId)
            return
        }
        this.duplicateMessageDetector.add(message.messageId)
        if (message.serviceId === this.serviceId) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } else {
            logger.trace('emit "message" ' + keyFromPeerDescriptor(message.sourceDescriptor!) + ' ' + message.serviceId + ' ' + message.messageId)
            this.emit('message', message)
        }
    }

    private onData(data: Uint8Array, peerDescriptor: PeerDescriptor): void {
        if (this.state === ConnectionManagerState.STOPPED) {
            return
        }
        this.metrics.receiveBytesPerSecond.record(data.byteLength)
        this.metrics.receiveMessagesPerSecond.record(1)
        let message: Message | undefined
        try {
            message = Message.fromBinary(data)
            logger.trace(`received protojson: ${protoToString(message, Message)}`)
        } catch (e) {
            logger.debug(`Parsing incoming data into Message failed: ${e}`)
            return
        }
        message.sourceDescriptor = peerDescriptor
        try {
            this.handleMessage(message)
        } catch (e) {
            logger.debug(`Handling incoming data failed: ${e}`)
        }
    }

    private onConnected = (connection: ManagedConnection) => {
        const peerDescriptor = connection.getPeerDescriptor()!
        this.emit('connected', peerDescriptor)
        logger.trace(keyFromPeerDescriptor(peerDescriptor) + ' onConnected() ' + connection.connectionType)
        this.onConnectionCountChange()
    }

    private onDisconnected = (connection: ManagedConnection, disconnectionType: DisconnectionType) => {
        logger.trace(keyOrUnknownFromPeerDescriptor(connection.getPeerDescriptor()) + ' onDisconnected() ' + disconnectionType)

        const hexKey = keyFromPeerDescriptor(connection.getPeerDescriptor()!)
        const storedConnection = this.connections.get(hexKey)
        if (storedConnection && storedConnection.connectionId.equals(connection.connectionId)) {
            this.locks.clearAllLocks(hexKey)
            this.connections.delete(hexKey)
            logger.trace(keyOrUnknownFromPeerDescriptor(connection.getPeerDescriptor()) 
                + ' deleted connection in onDisconnected() ' + disconnectionType)
            this.emit('disconnected', connection.getPeerDescriptor()!, disconnectionType)
            this.onConnectionCountChange()
        } else {
            logger.trace(keyOrUnknownFromPeerDescriptor(connection.getPeerDescriptor()) 
                + ' onDisconnected() did nothing, no such connection in connectionManager')
            if (storedConnection) {
                logger.trace(keyOrUnknownFromPeerDescriptor(connection.getPeerDescriptor())
                + ' connectionIds do not match ' + storedConnection.connectionId + ' ' + connection.connectionId)
            }
        }

    }

    private incomingConnectionCallback(connection: ManagedConnection): boolean {
        if (this.state === ConnectionManagerState.STOPPED) {
            return false
        }
        logger.trace('incomingConnectionCallback() objectId ' + connection.objectId)
        connection.offeredAsIncoming = true
        if (!this.acceptIncomingConnection(connection)) {
            return false
        }
        connection.on('managedData', this.onData)
        connection.on('disconnected', (disconnectionType: DisconnectionType, _code?: number, _reason?: string) => {
            this.onDisconnected(connection, disconnectionType)
        })
        this.emit('newConnection', connection)
        if (connection.isHandshakeCompleted()) {
            this.onConnected(connection)
        } else {
            connection.once('handshakeCompleted', (_peerDescriptor: PeerDescriptor) => {
                this.onConnected(connection)
            })
        }
        return true
    }

    private acceptIncomingConnection(newConnection: ManagedConnection): boolean {
        logger.trace(keyOrUnknownFromPeerDescriptor(newConnection.getPeerDescriptor()) + ' acceptIncomingConnection()')
        const newPeerID = peerIdFromPeerDescriptor(newConnection.getPeerDescriptor()!)
        const hexKey = keyFromPeerDescriptor(newConnection.getPeerDescriptor()!)
        if (this.connections.has(hexKey)) {
            if (newPeerID.hasSmallerHashThan(peerIdFromPeerDescriptor(this.ownPeerDescriptor!))) {
                logger.trace(keyOrUnknownFromPeerDescriptor(newConnection.getPeerDescriptor())
                    + ' acceptIncomingConnection() replace current connection')
                // replace the current connection
                const oldConnection = this.connections.get(newPeerID.toKey())!
                logger.trace('replaced: ' + keyOrUnknownFromPeerDescriptor(newConnection.getPeerDescriptor()))
                const buffer = oldConnection.stealOutputBuffer()
                
                for (const data of buffer) {
                    newConnection.sendNoWait(data)
                }
                
                oldConnection.reportBufferSentByOtherConnection()
                oldConnection.replacedByOtherConnection = true
            } else {
                newConnection.rejectedAsIncoming = true
                return false
            }
        }

        logger.trace(keyOrUnknownFromPeerDescriptor(newConnection.getPeerDescriptor()) + ' added to connections at acceptIncomingConnection')
        this.connections.set(hexKey, newConnection)

        return true
    }

    private async closeConnection(peerDescriptor: PeerDescriptor, disconnectionType: DisconnectionType, reason?: string): Promise<void> {
        logger.trace(keyFromPeerDescriptor(peerDescriptor) + ' ' + 'closeConnection() ' + reason)
        const id = keyFromPeerDescriptor(peerDescriptor)
        this.locks.clearAllLocks(id)
        if (this.connections.has(id)) {
            const connectionToClose = this.connections.get(id)!
            await connectionToClose.close(disconnectionType)

        } else {
            logger.trace(keyFromPeerDescriptor(peerDescriptor) + ' ' + 'closeConnection() this.connections did not have the id')
            this.emit('disconnected', peerDescriptor, 'OTHER')
        }
    }

    public lockConnection(targetDescriptor: PeerDescriptor, serviceId: ServiceId): void {
        if (this.state === ConnectionManagerState.STOPPED || isSamePeerDescriptor(targetDescriptor, this.ownPeerDescriptor!)) {
            return
        }
        const hexKey = keyFromPeerDescriptor(targetDescriptor)
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
        if (this.state === ConnectionManagerState.STOPPED || isSamePeerDescriptor(targetDescriptor, this.ownPeerDescriptor!)) {
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
        if (this.state === ConnectionManagerState.STOPPED || isSamePeerDescriptor(targetDescriptor, this.ownPeerDescriptor!)) {
            return
        }
        const hexKey = keyFromPeerDescriptor(targetDescriptor)
        this.locks.addWeakLocked(hexKey)
    }

    public weakUnlockConnection(targetDescriptor: PeerDescriptor): void {
        if (this.state === ConnectionManagerState.STOPPED || isSamePeerDescriptor(targetDescriptor, this.ownPeerDescriptor!)) {
            return
        }
        const hexKey = keyFromPeerDescriptor(targetDescriptor)
        this.locks.removeWeakLocked(hexKey)

    }

    private async gracefullyDisconnectAsync(targetDescriptor: PeerDescriptor, disconnectMode: DisconnectMode): Promise<void> {

        const connection = this.connections.get(peerIdFromPeerDescriptor(targetDescriptor).toKey())

        if (!connection) {
            logger.debug('gracefullyDisconnectedAsync() tried on a non-existing connection')
            return
        }

        const promise = new Promise<void>((resolve, _reject) => {
            // eslint-disable-next-line promise/catch-or-return
            waitForEvent3<ManagedConnectionEvents>(connection, 'disconnected', 2000).then(() => {
                logger.trace('disconnected event received in gracefullyDisconnectAsync()')
                return
            })
                .catch((e) => {
                    logger.trace('force-closing connection after timeout ' + e)
                    connection.close('OTHER')
                })
                .finally(() => {
                    logger.trace('resolving after receiving disconnected event')
                    resolve()
                })
        })

        this.doGracefullyDisconnectAsync(targetDescriptor, disconnectMode)
            .then(() => { return })
            .catch((e) => {
                logger.error(e)
            })

        await promise
    }

    private async doGracefullyDisconnectAsync(targetDescriptor: PeerDescriptor, disconnectMode: DisconnectMode): Promise<void> {
        logger.trace(keyFromPeerDescriptor(targetDescriptor) + ' gracefullyDisconnectAsync()')
        const remoteConnectionLocker = new RemoteConnectionLocker(
            this.ownPeerDescriptor!,
            targetDescriptor,
            ConnectionManager.PROTOCOL_VERSION,
            toProtoRpcClient(new ConnectionLockerClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        try {
            await remoteConnectionLocker.gracefulDisconnect(disconnectMode)
        } catch (ex) {
            logger.trace(keyFromPeerDescriptor(targetDescriptor) + ' remoteConnectionLocker.gracefulDisconnect() failed' + ex)
        }
    }

    public getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        return Array.from(this.connections.values())
            .filter((managedConnection: ManagedConnection) => managedConnection.isHandshakeCompleted())
            .map((managedConnection: ManagedConnection) => managedConnection.getPeerDescriptor()!)
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
        logger.trace(keyOrUnknownFromPeerDescriptor(disconnectNotice.peerDescriptor) + ' received gracefulDisconnect notice')

        if (disconnectNotice.disconnecMode === DisconnectMode.LEAVING) {
            this.closeConnection(disconnectNotice.peerDescriptor!, 'INCOMING_GRACEFUL_LEAVE', 'graceful leave notified')
        } else {
            this.closeConnection(disconnectNotice.peerDescriptor!, 'INCOMING_GRACEFUL_DISCONNECT', 'graceful disconnect notified')
        }
        return {}
    }

    private onConnectionCountChange() {
        this.metrics.connectionAverageCount.record(this.connections.size)
    }
}
