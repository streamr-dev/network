import { CountMetric, LevelMetric, Logger, Metric, MetricsContext, MetricsDefinition, RateMetric, waitForEvent3 } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { SortedContactList } from '../dht/contact/SortedContactList'
import { DuplicateDetector } from '../dht/routing/DuplicateDetector'
import * as Err from '../helpers/errors'
import {
    DisconnectMode,
    DisconnectNotice,
    LockRequest,
    LockResponse,
    Message,
    PeerDescriptor,
    UnlockRequest
} from '../proto/packages/dht/protos/DhtRpc'
import { ConnectionLockRpcClient } from '../proto/packages/dht/protos/DhtRpc.client'
import { DEFAULT_SEND_OPTIONS, ITransport, SendOptions, TransportEvents } from '../transport/ITransport'
import { RoutingRpcCommunicator } from '../transport/RoutingRpcCommunicator'
import { ConnectionLockHandler, LockID } from './ConnectionLockHandler'
import { ConnectorFacade } from './ConnectorFacade'
import { ManagedConnection, Events as ManagedConnectionEvents } from './ManagedConnection'
import { ConnectionLockRpcRemote } from './ConnectionLockRpcRemote'
import { WEBRTC_CLEANUP } from './webrtc/NodeWebrtcConnection'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ConnectionLockRpcLocal } from './ConnectionLockRpcLocal'
import { DhtAddress, areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../identifiers'
import { getOfferer } from '../helpers/offering'

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

const logger = new Logger(module)

enum ConnectionManagerState {
    IDLE = 'idle',
    RUNNING = 'running',
    STOPPING = 'stopping',
    STOPPED = 'stopped'
}

export interface ConnectionLocker {
    lockConnection(targetDescriptor: PeerDescriptor, lockId: LockID): void
    unlockConnection(targetDescriptor: PeerDescriptor, lockId: LockID): void
    weakLockConnection(nodeId: DhtAddress): void
    weakUnlockConnection(nodeId: DhtAddress): void
}

export interface PortRange {
    min: number
    max: number
}

export interface TlsCertificate {
    privateKeyFileName: string
    certFileName: string
}

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
export const getNodeIdOrUnknownFromPeerDescriptor = (peerDescriptor: PeerDescriptor | undefined): string => {
    if (peerDescriptor !== undefined) {
        return getNodeIdFromPeerDescriptor(peerDescriptor)
    } else {
        return 'unknown'
    }
}

export class ConnectionManager extends EventEmitter<TransportEvents> implements ITransport, ConnectionLocker {

    private config: ConnectionManagerConfig
    private readonly metricsContext: MetricsContext
    // TODO use config option or named constant?
    private readonly duplicateMessageDetector: DuplicateDetector = new DuplicateDetector(10000)
    private readonly metrics: ConnectionManagerMetrics
    private locks = new ConnectionLockHandler()
    private connections: Map<DhtAddress, ManagedConnection> = new Map()
    private readonly connectorFacade: ConnectorFacade
    private rpcCommunicator?: RoutingRpcCommunicator
    private disconnectorIntervalRef?: NodeJS.Timeout
    private state = ConnectionManagerState.IDLE

    constructor(config: ConnectionManagerConfig) {
        super()
        this.config = config
        this.onData = this.onData.bind(this)
        this.send = this.send.bind(this)
        this.onNewConnection = this.onNewConnection.bind(this)
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
            rpcRequestTimeout: 10000  // TODO use config option or named constant?
        })
        const lockRpcLocal = new ConnectionLockRpcLocal({
            addRemoteLocked: (id: DhtAddress, lockId: LockID) => this.locks.addRemoteLocked(id, lockId),
            removeRemoteLocked: (id: DhtAddress, lockId: LockID) => this.locks.removeRemoteLocked(id, lockId),
            closeConnection: (peerDescriptor: PeerDescriptor, gracefulLeave: boolean, reason?: string) => {
                // TODO should we have some handling for this floating promise?
                this.closeConnection(peerDescriptor, gracefulLeave, reason)
            },
            getLocalPeerDescriptor: () => this.getLocalPeerDescriptor()
        })
        this.rpcCommunicator.registerRpcMethod(LockRequest, LockResponse, 'lockRequest',
            (req: LockRequest, context: ServerCallContext) => lockRpcLocal.lockRequest(req, context))
        this.rpcCommunicator.registerRpcNotification(UnlockRequest, 'unlockRequest',
            (req: UnlockRequest, context: ServerCallContext) => lockRpcLocal.unlockRequest(req, context))
        this.rpcCommunicator.registerRpcNotification(DisconnectNotice, 'gracefulDisconnect',
            (req: DisconnectNotice, context: ServerCallContext) => lockRpcLocal.gracefulDisconnect(req, context))
    }

    public garbageCollectConnections(maxConnections: number, lastUsedLimit: number): void {
        if (this.connections.size <= maxConnections) {
            return
        }
        const disconnectionCandidates = new SortedContactList<ManagedConnection>({
            referenceId: getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor()), 
            maxSize: 100000,  // TODO use config option or named constant?
            allowToContainReferenceId: false,
            emitEvents: false
        })
        this.connections.forEach((connection, key) => {
            // TODO: Investigate why multiple invalid WS client connections to the same
            // server with a different nodeId can remain in the this.connections map.
            // Seems to only happen if the ConnectionManager acting as client is not running a WS server itself.
            if (connection.getPeerDescriptor() !== undefined && !this.hasConnection(getNodeIdFromPeerDescriptor(connection.getPeerDescriptor()!))) {
                logger.trace(`Attempting to disconnect a hanging connection to ${getNodeIdFromPeerDescriptor(connection.getPeerDescriptor()!)}`)
                connection.close(false).catch(() => {})
                this.connections.delete(key)
            } else if (!this.locks.isLocked(connection.getNodeId()) && Date.now() - connection.getLastUsed() > lastUsedLimit) {
                logger.trace('disconnecting in timeout interval: ' + getNodeIdOrUnknownFromPeerDescriptor(connection.getPeerDescriptor()))
                disconnectionCandidates.addContact(connection)
            }
        })
        const sortedCandidates = disconnectionCandidates.getAllContacts()
        const targetNum = this.connections.size - maxConnections
        for (let i = 0; i < sortedCandidates.length && i < targetNum; i++) {
            const peerDescriptor = sortedCandidates[sortedCandidates.length - 1 - i].getPeerDescriptor()!
            logger.trace('garbageCollecting ' + getNodeIdFromPeerDescriptor(peerDescriptor))
            this.gracefullyDisconnectAsync(peerDescriptor, DisconnectMode.NORMAL).catch((_e) => { })
        }
    }

    public async start(): Promise<void> {
        if (this.state === ConnectionManagerState.RUNNING || this.state === ConnectionManagerState.STOPPED) {
            throw new Err.CouldNotStart(`Cannot start already ${this.state} module`)
        }
        this.state = ConnectionManagerState.RUNNING
        logger.trace(`Starting ConnectionManager...`)
        await this.connectorFacade.start(
            (connection: ManagedConnection) => this.onNewConnection(connection),
            (nodeId: DhtAddress) => this.hasConnection(nodeId),
            this
        )
        // Garbage collection of connections
        this.disconnectorIntervalRef = setInterval(() => {
            logger.trace('disconnectorInterval')
            const LAST_USED_LIMIT = 20000
            this.garbageCollectConnections(this.config.maxConnections ?? 80, LAST_USED_LIMIT)
        }, 5000)  // TODO use config option or named constant?
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
                // TODO use config option or named constant?
                const eventReceived = waitForEvent3<ManagedConnectionEvents>(peer, 'disconnected', 2000)
                // TODO should we have some handling for this floating promise?
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

    public getLocalLockedConnectionCount(): number {
        return this.locks.getLocalLockedConnectionCount()
    }

    public getRemoteLockedConnectionCount(): number {
        return this.locks.getRemoteLockedConnectionCount()
    }

    public getWeakLockedConnectionCount(): number {
        return this.locks.getWeakLockedConnectionCount()
    }

    public async send(message: Message, opts: SendOptions = DEFAULT_SEND_OPTIONS): Promise<void> {
        if ((this.state === ConnectionManagerState.STOPPED || this.state === ConnectionManagerState.STOPPING) && !opts.sendIfStopped) {
            return
        }
        const peerDescriptor = message.targetDescriptor!
        if (this.isConnectionToSelf(peerDescriptor)) {
            throw new Err.CannotConnectToSelf('Cannot send to self')
        }
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        logger.trace(`Sending message to: ${nodeId}`)
        message = {
            ...message,
            sourceDescriptor: this.getLocalPeerDescriptor()
        }
        let connection = this.connections.get(nodeId)
        if (!connection && opts.connect) {
            connection = this.connectorFacade.createConnection(peerDescriptor)
            this.onNewConnection(connection)
        } else if (!connection) {
            throw new Err.SendFailed('No connection to target, connect flag is false')
        }
        const binary = Message.toBinary(message)
        this.metrics.sendBytesPerSecond.record(binary.byteLength)
        this.metrics.sendMessagesPerSecond.record(1)
        return connection.send(binary, opts.connect)
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

    public getConnection(nodeId: DhtAddress): ManagedConnection | undefined {
        return this.connections.get(nodeId)
    }

    public getLocalPeerDescriptor(): PeerDescriptor {
        return this.connectorFacade.getLocalPeerDescriptor()!
    }

    public hasConnection(nodeId: DhtAddress): boolean {
        return this.connections.has(nodeId)
    }

    public hasLocalLockedConnection(nodeId: DhtAddress): boolean {
        return this.locks.isLocalLocked(nodeId)
    }

    public hasRemoteLockedConnection(nodeId: DhtAddress): boolean {
        return this.locks.isRemoteLocked(nodeId)
    }

    private handleMessage(message: Message): void {
        const messageType = message.body.oneofKind
        logger.trace('Received message of type ' + messageType)
        if (messageType !== 'rpcMessage') {
            logger.trace('Filtered out non-RPC message of type ' + messageType)
            return
        }
        if (this.duplicateMessageDetector.isMostLikelyDuplicate(message.messageId)) {
            logger.trace('handleMessage filtered duplicate ' + getNodeIdFromPeerDescriptor(message.sourceDescriptor!)
                + ' ' + message.serviceId + ' ' + message.messageId)
            return
        }
        this.duplicateMessageDetector.add(message.messageId)
        if (message.serviceId === INTERNAL_SERVICE_ID) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
        } else {
            logger.trace('emit "message" ' + getNodeIdFromPeerDescriptor(message.sourceDescriptor!)
                + ' ' + message.serviceId + ' ' + message.messageId)
            this.emit('message', message)
        }
    }

    public handleIncomingMessage(message: Message): boolean {
        if (message.serviceId === INTERNAL_SERVICE_ID) {
            this.rpcCommunicator?.handleMessageFromPeer(message)
            return true
        }
        return false
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
        logger.trace(getNodeIdFromPeerDescriptor(peerDescriptor) + ' onConnected() ' + connection.connectionType)
        this.onConnectionCountChange()
    }

    private onDisconnected(connection: ManagedConnection, gracefulLeave: boolean) {
        const nodeId = getNodeIdFromPeerDescriptor(connection.getPeerDescriptor()!)
        logger.trace(nodeId + ' onDisconnected() gracefulLeave: ' + gracefulLeave)
        const storedConnection = this.connections.get(nodeId)
        if (storedConnection && (storedConnection.connectionId === connection.connectionId)) {
            this.locks.clearAllLocks(nodeId)
            this.connections.delete(nodeId)
            logger.trace(nodeId + ' deleted connection in onDisconnected() gracefulLeave: ' + gracefulLeave)
            this.emit('disconnected', connection.getPeerDescriptor()!, gracefulLeave)
            this.onConnectionCountChange()
        } else {
            logger.trace(nodeId + ' onDisconnected() did nothing, no such connection in connectionManager')
            if (storedConnection) {
                logger.trace(nodeId + ' connectionIds do not match ' + storedConnection.connectionId + ' ' + connection.connectionId.toString())
            }
        }
    }

    private onNewConnection(connection: ManagedConnection): boolean {
        if (this.state === ConnectionManagerState.STOPPED) {
            return false
        }
        logger.trace('onNewConnection()')
        if (!this.acceptNewConnection(connection)) {
            return false
        }
        connection.on('managedData', this.onData)
        connection.on('disconnected', (gracefulLeave: boolean) => {
            this.onDisconnected(connection, gracefulLeave)
        })
        if (connection.isHandshakeCompleted()) {
            this.onConnected(connection)
        } else {
            connection.once('handshakeCompleted', () => {
                this.onConnected(connection)
            })
        }
        return true
    }

    private acceptNewConnection(newConnection: ManagedConnection): boolean {
        const nodeId = getNodeIdFromPeerDescriptor(newConnection.getPeerDescriptor()!)
        logger.trace(nodeId + ' acceptIncomingConnection()')
        if (this.connections.has(nodeId)) {
            if (getOfferer(getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor()), nodeId) === 'remote') {
                logger.trace(nodeId + ' acceptIncomingConnection() replace current connection')
                // replace the current connection
                const oldConnection = this.connections.get(nodeId)!
                logger.trace('replaced: ' + nodeId)
                const buffer = oldConnection.stealOutputBuffer()

                for (const data of buffer) {
                    newConnection.sendNoWait(data)
                }

                oldConnection.reportBufferSentByOtherConnection()
                oldConnection.replacedByOtherConnection = true
            } else {
                return false
            }
        }

        logger.trace(nodeId + ' added to connections at acceptIncomingConnection')
        this.connections.set(nodeId, newConnection)

        return true
    }

    private async closeConnection(peerDescriptor: PeerDescriptor, gracefulLeave: boolean, reason?: string): Promise<void> {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        logger.trace(nodeId + ' ' + 'closeConnection() ' + reason)
        this.locks.clearAllLocks(nodeId)
        if (this.connections.has(nodeId)) {
            const connectionToClose = this.connections.get(nodeId)!
            await connectionToClose.close(gracefulLeave)

        } else {
            logger.trace(nodeId + ' ' + 'closeConnection() this.connections did not have the id')
            this.emit('disconnected', peerDescriptor, false)
        }
    }

    public lockConnection(targetDescriptor: PeerDescriptor, lockId: LockID): void {
        if (this.state === ConnectionManagerState.STOPPED || areEqualPeerDescriptors(targetDescriptor, this.getLocalPeerDescriptor())) {
            return
        }
        const nodeId = getNodeIdFromPeerDescriptor(targetDescriptor)
        const rpcRemote = new ConnectionLockRpcRemote(
            this.getLocalPeerDescriptor(),
            targetDescriptor,
            this.rpcCommunicator!,
            ConnectionLockRpcClient
        )
        this.locks.addLocalLocked(nodeId, lockId)
        rpcRemote.lockRequest(lockId)
            .then((_accepted) => logger.trace('LockRequest successful'))
            .catch((err) => { logger.debug(err) })
    }

    public unlockConnection(targetDescriptor: PeerDescriptor, lockId: LockID): void {
        if (this.state === ConnectionManagerState.STOPPED || areEqualPeerDescriptors(targetDescriptor, this.getLocalPeerDescriptor())) {
            return
        }
        const nodeId = getNodeIdFromPeerDescriptor(targetDescriptor)
        this.locks.removeLocalLocked(nodeId, lockId)
        const rpcRemote = new ConnectionLockRpcRemote(
            this.getLocalPeerDescriptor(),
            targetDescriptor,
            this.rpcCommunicator!,
            ConnectionLockRpcClient
        )
        if (this.connections.has(nodeId)) {
            rpcRemote.unlockRequest(lockId)
        }
    }

    public weakLockConnection(nodeId: DhtAddress): void {
        if (this.state === ConnectionManagerState.STOPPED || (nodeId === getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor()))) {
            return
        }
        this.locks.addWeakLocked(nodeId)
    }

    public weakUnlockConnection(nodeId: DhtAddress): void {
        if (this.state === ConnectionManagerState.STOPPED || (nodeId === getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor()))) {
            return
        }
        this.locks.removeWeakLocked(nodeId)
    }

    private async gracefullyDisconnectAsync(targetDescriptor: PeerDescriptor, disconnectMode: DisconnectMode): Promise<void> {

        const connection = this.connections.get(getNodeIdFromPeerDescriptor(targetDescriptor))

        if (!connection) {
            logger.debug('gracefullyDisconnectedAsync() tried on a non-existing connection')
            return
        }

        const promise = new Promise<void>((resolve, _reject) => {
            // TODO use config option or named constant?
            // eslint-disable-next-line promise/catch-or-return
            waitForEvent3<ManagedConnectionEvents>(connection, 'disconnected', 2000).then(() => {
                logger.trace('disconnected event received in gracefullyDisconnectAsync()')
                return
            })
                .catch((e) => {
                    logger.trace('force-closing connection after timeout ' + e)
                    // TODO should we have some handling for this floating promise?
                    connection.close(true)
                })
                .finally(() => {
                    logger.trace('resolving after receiving disconnected event')
                    resolve()
                })
        })

        await Promise.all([
            promise,
            this.doGracefullyDisconnectAsync(targetDescriptor, disconnectMode)
        ])
    }

    private async doGracefullyDisconnectAsync(targetDescriptor: PeerDescriptor, disconnectMode: DisconnectMode): Promise<void> {
        const nodeId = getNodeIdFromPeerDescriptor(targetDescriptor)
        logger.trace(nodeId + ' gracefullyDisconnectAsync()')
        const rpcRemote = new ConnectionLockRpcRemote(
            this.getLocalPeerDescriptor(),
            targetDescriptor,
            this.rpcCommunicator!,
            ConnectionLockRpcClient
        )
        try {
            await rpcRemote.gracefulDisconnect(disconnectMode)
        } catch (ex) {
            logger.trace(nodeId + ' remote.gracefulDisconnect() failed' + ex)
        }
    }

    public getConnections(): PeerDescriptor[] {
        return Array.from(this.connections.values())
            .filter((managedConnection: ManagedConnection) => managedConnection.isHandshakeCompleted())
            .map((managedConnection: ManagedConnection) => managedConnection.getPeerDescriptor()!)
    }

    private onConnectionCountChange() {
        this.metrics.connectionAverageCount.record(this.connections.size)
    }
}
