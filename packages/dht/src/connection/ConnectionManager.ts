import { toProtoRpcClient } from '@streamr/proto-rpc'
import { CountMetric, LevelMetric, Logger, Metric, MetricsContext, MetricsDefinition, RateMetric, waitForEvent3 } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { Contact } from '../dht/contact/Contact'
import { SortedContactList } from '../dht/contact/SortedContactList'
import { DuplicateDetector } from '../dht/routing/DuplicateDetector'
import { PeerIDKey } from '../helpers/PeerID'
import * as Err from '../helpers/errors'
import {
    areEqualPeerDescriptors,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../helpers/peerIdFromPeerDescriptor'
import { protoToString } from '../helpers/protoToString'
import {
    DisconnectMode,
    DisconnectNotice,
    DisconnectNoticeResponse,
    LockRequest,
    LockResponse,
    Message,
    MessageType,
    PeerDescriptor,
    UnlockRequest
} from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionLockRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { ITransport, TransportEvents } from '../transport/ITransport'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { ConnectionLockHandler, LockID } from './ConnectionLockHandler'
import { ConnectorFacade } from './ConnectorFacade'
import { ManagedConnection, Events as ManagedConnectionEvents } from './ManagedConnection'
import { ConnectionLockRpcRemote } from './ConnectionLockRpcRemote'
import { WEBRTC_CLEANUP } from './webrtc/NodeWebrtcConnection'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ConnectionLockRpcLocal } from './ConnectionLockRpcLocal'

export interface ConnectionManagerConfig {
    maxConnections?: number
    metricsContext: MetricsContext
    createConnectorFacade: () => ConnectorFacade
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

// TODO move this type identifiers.ts and use also in other classes (and rename to ServiceID)
type ServiceId = string

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

const INTERNAL_SERVICE_ID = 'system/connection-manager'

// Form an string representation from a peer description which can be undefined. This output 
// should only be used only for log output. TODO remove this method if we no longer use
// peerDescriptors which can be undefined, e.g.
// - if we refactor ConnectionManager so that it doesn't process handshake requests too early 
//   and therefore this.localPeerDescriptor can't be undefine (NET-1129)
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

    private config: ConnectionManagerConfig
    private readonly metricsContext: MetricsContext
    private readonly duplicateMessageDetector: DuplicateDetector = new DuplicateDetector(100000, 100)
    private readonly metrics: ConnectionManagerMetrics
    private locks = new ConnectionLockHandler()
    private connections: Map<PeerIDKey, ManagedConnection> = new Map()
    private readonly connectorFacade: ConnectorFacade
    private rpcCommunicator?: RoutingRpcCommunicator
    private disconnectorIntervalRef?: NodeJS.Timeout
    private state = ConnectionManagerState.IDLE

    constructor(config: ConnectionManagerConfig) {
        super()
        this.config = config
        this.onData = this.onData.bind(this)
        this.send = this.send.bind(this)
        this.onIncomingConnection = this.onIncomingConnection.bind(this)
        this.metricsContext = this.config.metricsContext ?? new MetricsContext()
        this.metrics = {
            sendMessagesPerSecond: new RateMetric(),
            sendBytesPerSecond: new RateMetric(),
            receiveMessagesPerSecond: new RateMetric(),
            receiveBytesPerSecond: new RateMetric(),
            connectionAverageCount: new LevelMetric(0),
            connectionTotalFailureCount: new CountMetric()
        }
        this.metricsContext.addMetrics('node', this.metrics)
        this.connectorFacade = this.config.createConnectorFacade()
        this.send = this.send.bind(this)
        this.rpcCommunicator = new RoutingRpcCommunicator(INTERNAL_SERVICE_ID, this.send, {
            rpcRequestTimeout: 10000
        })
        const lockRpcLocal = new ConnectionLockRpcLocal({
            addRemoteLocked: (id: PeerIDKey, serviceId: string) => this.locks.addRemoteLocked(id, serviceId),
            removeRemoteLocked: (id: PeerIDKey, serviceId: string) => this.locks.removeRemoteLocked(id, serviceId),
            closeConnection: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean, reason?: string) => {
                this.closeConnection(peerDescriptor, gracefulLeave, reason)
            },
            getLocalPeerDescriptor: () => this.getLocalPeerDescriptor()
        })
        this.rpcCommunicator.registerRpcMethod(LockRequest, LockResponse, 'lockRequest',
            (req: LockRequest, context: ServerCallContext) => lockRpcLocal.lockRequest(req, context))
        this.rpcCommunicator.registerRpcNotification(UnlockRequest, 'unlockRequest',
            (req: UnlockRequest, context: ServerCallContext) => lockRpcLocal.unlockRequest(req, context))
        this.rpcCommunicator.registerRpcMethod(DisconnectNotice, DisconnectNoticeResponse, 'gracefulDisconnect',
            (req: DisconnectNotice, context: ServerCallContext) => lockRpcLocal.gracefulDisconnect(req, context))
    }

    public garbageCollectConnections(maxConnections: number, lastUsedLimit: number): void {
        if (this.connections.size <= maxConnections) {
            return
        }
        const disconnectionCandidates = new SortedContactList<Contact>(peerIdFromPeerDescriptor(this.getLocalPeerDescriptor()), 100000)
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

    public async start(): Promise<void> {
        if (this.state === ConnectionManagerState.RUNNING || this.state === ConnectionManagerState.STOPPED) {
            throw new Err.CouldNotStart(`Cannot start already ${this.state} module`)
        }
        this.state = ConnectionManagerState.RUNNING
        logger.trace(`Starting ConnectionManager...`)
        await this.connectorFacade.start(
            (connection: ManagedConnection) => this.onIncomingConnection(connection),
            (peerDescriptor: PeerDescriptor) => this.canConnect(peerDescriptor),
            this
        )
        // Garbage collection of connections
        this.disconnectorIntervalRef = setInterval(() => {
            logger.trace('disconnectorInterval')
            const LAST_USED_LIMIT = 20000
            this.garbageCollectConnections(this.config.maxConnections ?? 80, LAST_USED_LIMIT)
        }, 5000)
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
        await this.connectorFacade.stop()

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
                peer.close(true)
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
        this.duplicateMessageDetector.clear()
        this.locks.clear()
        this.removeAllListeners()
        // TODO would it make sense to move this call to WebrtcConnector#stop()?
        // - but note that we should call this only after connections have been closed
        //   (i.e the this.gracefullyDisconnectAsync() calls above)
        WEBRTC_CLEANUP.cleanUp()
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
            sourceDescriptor: this.getLocalPeerDescriptor()
        }
        const peerIdKey = keyFromPeerDescriptor(peerDescriptor)
        let connection = this.connections.get(peerIdKey)
        if (!connection && !doNotConnect) {
            connection = this.connectorFacade.createConnection(peerDescriptor)
            this.onIncomingConnection(connection)
        } else if (!connection) {
            throw new Err.SendFailed('No connection to target, doNotConnect flag is true')
        }
        const binary = Message.toBinary(message)
        this.metrics.sendBytesPerSecond.record(binary.byteLength)
        this.metrics.sendMessagesPerSecond.record(1)
        return connection.send(binary, doNotConnect)
    }

    private isConnectionToSelf(peerDescriptor: PeerDescriptor): boolean { 
        return areEqualPeerDescriptors(peerDescriptor, this.getLocalPeerDescriptor()) || this.isOwnWebsocketServer(peerDescriptor)
    }

    private isOwnWebsocketServer(peerDescriptor: PeerDescriptor): boolean {
        const localPeerDescriptor = this.getLocalPeerDescriptor()
        if ((peerDescriptor.websocket !== undefined) && (localPeerDescriptor.websocket !== undefined)) {
            return ((peerDescriptor.websocket.port === localPeerDescriptor.websocket.port) 
                && (peerDescriptor.websocket.host === localPeerDescriptor.websocket.host))
        } else {
            return false
        }
    }

    public getConnection(peerDescriptor: PeerDescriptor): ManagedConnection | undefined {
        const peerIdKey = keyFromPeerDescriptor(peerDescriptor)
        return this.connections.get(peerIdKey)
    }

    public getLocalPeerDescriptor(): PeerDescriptor {
        return this.connectorFacade.getLocalPeerDescriptor()!
    }

    public hasConnection(peerDescriptor: PeerDescriptor): boolean {
        const peerIdKey = keyFromPeerDescriptor(peerDescriptor)
        return this.connections.has(peerIdKey)
    }

    public hasLocalLockedConnection(peerDescriptor: PeerDescriptor): boolean {
        const peerIdKey = keyFromPeerDescriptor(peerDescriptor)
        return this.locks.isLocalLocked(peerIdKey)
    }

    public hasRemoteLockedConnection(peerDescriptor: PeerDescriptor): boolean {
        const peerIdKey = keyFromPeerDescriptor(peerDescriptor)
        return this.locks.isRemoteLocked(peerIdKey)
    }

    private canConnect(peerDescriptor: PeerDescriptor): boolean {
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
        if (message.serviceId === INTERNAL_SERVICE_ID) {
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

    private onConnected(connection: ManagedConnection) {
        const peerDescriptor = connection.getPeerDescriptor()!
        this.emit('connected', peerDescriptor)
        logger.trace(keyFromPeerDescriptor(peerDescriptor) + ' onConnected()')
        this.onConnectionCountChange()
    }

    private onDisconnected(connection: ManagedConnection, gracefulLeave: boolean) {
        logger.trace(keyOrUnknownFromPeerDescriptor(connection.getPeerDescriptor()) + ' onDisconnected() gracefulLeave: ' + gracefulLeave)

        const peerIdKey = keyFromPeerDescriptor(connection.getPeerDescriptor()!)
        const storedConnection = this.connections.get(peerIdKey)
        if (storedConnection && storedConnection.connectionId.equals(connection.connectionId)) {
            this.locks.clearAllLocks(peerIdKey)
            this.connections.delete(peerIdKey)
            logger.trace(keyOrUnknownFromPeerDescriptor(connection.getPeerDescriptor()) 
                + ' deleted connection in onDisconnected() gracefulLeave: ' + gracefulLeave)
            this.emit('disconnected', connection.getPeerDescriptor()!, gracefulLeave)
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

    private onIncomingConnection(connection: ManagedConnection): boolean {
        if (this.state === ConnectionManagerState.STOPPED) {
            return false
        }
        logger.trace('onIncomingConnection()')
        connection.offeredAsIncoming = true
        if (!this.acceptIncomingConnection(connection)) {
            return false
        }
        connection.on('managedData', this.onData)
        connection.on('disconnected', (gracefulLeave: boolean) => {
            this.onDisconnected(connection, gracefulLeave)
        })
        this.emit('newConnection', connection)
        if (connection.isHandshakeCompleted()) {
            this.onConnected(connection)
        } else {
            connection.once('handshakeCompleted', () => {
                this.onConnected(connection)
            })
        }
        return true
    }

    private acceptIncomingConnection(newConnection: ManagedConnection): boolean {
        logger.trace(keyFromPeerDescriptor(newConnection.getPeerDescriptor()!) + ' acceptIncomingConnection()')
        const newPeerID = peerIdFromPeerDescriptor(newConnection.getPeerDescriptor()!)
        const peerIdKey = keyFromPeerDescriptor(newConnection.getPeerDescriptor()!)
        if (this.connections.has(peerIdKey)) {
            if (newPeerID.hasSmallerHashThan(peerIdFromPeerDescriptor(this.getLocalPeerDescriptor()))) {
                logger.trace(keyOrUnknownFromPeerDescriptor(newConnection.getPeerDescriptor())
                    + ' acceptIncomingConnection() replace current connection')
                // replace the current connection
                const oldConnection = this.connections.get(newPeerID.toKey())!
                logger.trace('replaced: ' + keyFromPeerDescriptor(newConnection.getPeerDescriptor()!))
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

        logger.trace(keyFromPeerDescriptor(newConnection.getPeerDescriptor()!) + ' added to connections at acceptIncomingConnection')
        this.connections.set(peerIdKey, newConnection)

        return true
    }

    private async closeConnection(peerDescriptor: PeerDescriptor, gracefulLeave: boolean, reason?: string): Promise<void> {
        logger.trace(keyFromPeerDescriptor(peerDescriptor) + ' ' + 'closeConnection() ' + reason)
        const id = keyFromPeerDescriptor(peerDescriptor)
        this.locks.clearAllLocks(id)
        if (this.connections.has(id)) {
            const connectionToClose = this.connections.get(id)!
            await connectionToClose.close(gracefulLeave)

        } else {
            logger.trace(keyFromPeerDescriptor(peerDescriptor) + ' ' + 'closeConnection() this.connections did not have the id')
            this.emit('disconnected', peerDescriptor, false)
        }
    }

    public lockConnection(targetDescriptor: PeerDescriptor, lockId: LockID): void {
        if (this.state === ConnectionManagerState.STOPPED || areEqualPeerDescriptors(targetDescriptor, this.getLocalPeerDescriptor())) {
            return
        }
        const peerIdKey = keyFromPeerDescriptor(targetDescriptor)
        const rpcRemote = new ConnectionLockRpcRemote(
            this.getLocalPeerDescriptor(),
            targetDescriptor,
            toProtoRpcClient(new ConnectionLockRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        this.locks.addLocalLocked(peerIdKey, lockId)
        rpcRemote.lockRequest(lockId)
            .then((_accepted) => logger.trace('LockRequest successful'))
            .catch((err) => { logger.debug(err) })
    }

    public unlockConnection(targetDescriptor: PeerDescriptor, lockId: LockID): void {
        if (this.state === ConnectionManagerState.STOPPED || areEqualPeerDescriptors(targetDescriptor, this.getLocalPeerDescriptor())) {
            return
        }
        const peerIdKey = keyFromPeerDescriptor(targetDescriptor)
        this.locks.removeLocalLocked(peerIdKey, lockId)
        const rpcRemote = new ConnectionLockRpcRemote(
            this.getLocalPeerDescriptor(),
            targetDescriptor,
            toProtoRpcClient(new ConnectionLockRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        if (this.connections.has(peerIdKey)) {
            rpcRemote.unlockRequest(lockId)
        }
    }

    public weakLockConnection(targetDescriptor: PeerDescriptor): void {
        if (this.state === ConnectionManagerState.STOPPED || areEqualPeerDescriptors(targetDescriptor, this.getLocalPeerDescriptor())) {
            return
        }
        const peerIdKey = keyFromPeerDescriptor(targetDescriptor)
        this.locks.addWeakLocked(peerIdKey)
    }

    public weakUnlockConnection(targetDescriptor: PeerDescriptor): void {
        if (this.state === ConnectionManagerState.STOPPED || areEqualPeerDescriptors(targetDescriptor, this.getLocalPeerDescriptor())) {
            return
        }
        const peerIdKey = keyFromPeerDescriptor(targetDescriptor)
        this.locks.removeWeakLocked(peerIdKey)

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
                    connection.close(true)
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
        const rpcRemote = new ConnectionLockRpcRemote(
            this.getLocalPeerDescriptor(),
            targetDescriptor,
            toProtoRpcClient(new ConnectionLockRpcClient(this.rpcCommunicator!.getRpcClientTransport()))
        )
        try {
            await rpcRemote.gracefulDisconnect(disconnectMode)
        } catch (ex) {
            logger.trace(keyFromPeerDescriptor(targetDescriptor) + ' remote.gracefulDisconnect() failed' + ex)
        }
    }

    public getAllConnectionPeerDescriptors(): PeerDescriptor[] {
        return Array.from(this.connections.values())
            .filter((managedConnection: ManagedConnection) => managedConnection.isHandshakeCompleted())
            .map((managedConnection: ManagedConnection) => managedConnection.getPeerDescriptor()!)
    }

    private onConnectionCountChange() {
        this.metrics.connectionAverageCount.record(this.connections.size)
    }
}
