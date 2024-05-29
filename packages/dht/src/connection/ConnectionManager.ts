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
import { ConnectionLockStates, LockID } from './ConnectionLockStates'
import { ConnectorFacade } from './ConnectorFacade'
import { ManagedConnection, Events as ManagedConnectionEvents } from './ManagedConnection'
import { ConnectionLockRpcRemote } from './ConnectionLockRpcRemote'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { ConnectionLockRpcLocal } from './ConnectionLockRpcLocal'
import { DhtAddress, areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../identifiers'
import { getOfferer } from '../helpers/offering'
import { ConnectionsView } from './ConnectionsView'
import { OutputBuffer } from './OutputBuffer'
import { IConnection } from './IConnection'
import { PendingConnection } from './PendingConnection'

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
    weakLockConnection(nodeId: DhtAddress, lockId: LockID): void
    weakUnlockConnection(nodeId: DhtAddress, lockId: LockID): void
    getLocalLockedConnectionCount(): number
    getRemoteLockedConnectionCount(): number
    getWeakLockedConnectionCount(): number
}

export interface PortRange {
    min: number
    max: number
}

export interface TlsCertificate {
    privateKeyFileName: string
    certFileName: string
}

interface ConnectingEndpoint {
    connected: false
    connection: PendingConnection
    buffer: OutputBuffer
}

interface ConnectedEndpoint {
    connected: true
    connection: ManagedConnection
}

type Endpoint = ConnectedEndpoint | ConnectingEndpoint

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

export class ConnectionManager extends EventEmitter<TransportEvents> implements ITransport, ConnectionsView, ConnectionLocker {

    private config: ConnectionManagerConfig
    private readonly metricsContext: MetricsContext
    // TODO use config option or named constant?
    private readonly duplicateMessageDetector: DuplicateDetector = new DuplicateDetector(10000)
    private readonly metrics: ConnectionManagerMetrics
    private locks = new ConnectionLockStates()
    private endpoints: Map<DhtAddress, Endpoint> = new Map()
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
        this.onHandshakeCompleted = this.onHandshakeCompleted.bind(this)
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

    /*
     * Removes connections if there are more than maxConnections: in that case we remove unlocked connections
     * which hasn't been used within maxIdleTime.
     */
    public garbageCollectConnections(maxConnections: number, maxIdleTime: number): void {
        if (this.endpoints.size <= maxConnections) {
            return
        }
        const disconnectionCandidates = new SortedContactList<ManagedConnection>({
            referenceId: getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor()), 
            maxSize: 100000,  // TODO use config option or named constant?
            allowToContainReferenceId: false
        })
        this.endpoints.forEach((endpoint) => {
            if (endpoint.connected) {
                const connection = endpoint.connection
                if (!this.locks.isLocked(connection.getNodeId()) && Date.now() - connection.getLastUsedTimestamp() > maxIdleTime) {
                    logger.trace('disconnecting in timeout interval: ' + getNodeIdOrUnknownFromPeerDescriptor(connection.getPeerDescriptor()))
                    disconnectionCandidates.addContact(connection)
                }
            }
        })
        const disconnectables = disconnectionCandidates.getFurthestContacts(this.endpoints.size - maxConnections)
        for (const disconnectable of disconnectables) {
            const peerDescriptor = disconnectable.getPeerDescriptor()!
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
            (connection: PendingConnection) => this.onNewConnection(connection),
            (peerDescriptor: PeerDescriptor, connection: IConnection) => this.onHandshakeCompleted(peerDescriptor, connection),
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

        await Promise.all(Array.from(this.endpoints.values()).map(async (endpoint) => {
            if (endpoint.connected) {
                try {
                    await this.gracefullyDisconnectAsync(endpoint.connection.getPeerDescriptor()!, DisconnectMode.LEAVING)
                } catch (e) {
                    logger.error(e)
                }
            } else {
                const connection = endpoint.connection
                logger.trace('handshake of connection not completed, force-closing')
                // TODO use config option or named constant?
                const eventReceived = waitForEvent3(connection as any, 'disconnected', 2000)
                // TODO should we have some handling for this floating promise?
                connection.close(true)
                try {
                    await eventReceived
                    logger.trace('resolving after receiving disconnected event from non-handshaked connection')
                } catch (e) {
                    endpoint.buffer.reject()
                    logger.trace('force-closing non-handshaked connection timed out ' + e)
                }
            }
        }))

        this.state = ConnectionManagerState.STOPPED
        this.rpcCommunicator!.stop()
        this.duplicateMessageDetector.clear()
        this.locks.clear()
        this.removeAllListeners()
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

        let connection = this.endpoints.get(nodeId)?.connection
        if (!connection && opts.connect) {
            connection = this.connectorFacade.createConnection(peerDescriptor)
            this.onNewConnection(connection)
        } else if (!connection) {
            throw new Err.SendFailed('No connection to target, connect flag is false')
        }
        const binary = Message.toBinary(message)
        this.metrics.sendBytesPerSecond.record(binary.byteLength)
        this.metrics.sendMessagesPerSecond.record(1)

        if (this.endpoints.get(nodeId)!.connected) {
            return (connection as ManagedConnection).send(binary)
        } else {
            return (this.endpoints.get(nodeId)! as ConnectingEndpoint).buffer.push(binary)
        }
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

    public getLocalPeerDescriptor(): PeerDescriptor {
        return this.connectorFacade.getLocalPeerDescriptor()!
    }

    public hasConnection(nodeId: DhtAddress): boolean {
        // TODO if we remove filtering in getConnections, this can just be this.connection.has(nodeId)
        return this.getConnections().some((c) => getNodeIdFromPeerDescriptor(c) == nodeId)
    }

    public getConnectionCount(): number {
        // TODO if we remove filtering in getConnections, this can just be this.connection.length
        return this.getConnections().length
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

    private onConnected(peerDescriptor: PeerDescriptor, connection: IConnection) {
        const managedConnection = new ManagedConnection(peerDescriptor, connection)
        managedConnection.on('managedData', this.onData)
        managedConnection.once('disconnected', (gracefulLeave: boolean) => this.onDisconnected(peerDescriptor, gracefulLeave))

        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        const endpoint = this.endpoints.get(nodeId)! as ConnectingEndpoint
        const outputBuffer = endpoint.buffer
        const pendingConnection = endpoint.connection
        const buffer = outputBuffer.getBuffer()
        while (buffer.length > 0) {
            logger.trace('emptying buffer')
            managedConnection.send(buffer.shift()!)
        }
        outputBuffer.resolve()
        pendingConnection.destroy()
        this.endpoints.set(nodeId, {
            connected: true,
            connection: managedConnection
        })
        this.emit('connected', peerDescriptor)
        this.onConnectionCountChange()
    }

    private onDisconnected(peerDescriptor: PeerDescriptor, gracefulLeave: boolean) {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        logger.trace(nodeId + ' onDisconnected() gracefulLeave: ' + gracefulLeave)
        const endpoint = this.endpoints.get(nodeId)
        if (endpoint) {
            this.locks.clearAllLocks(nodeId)
            if (endpoint.connected === false) {
                endpoint.buffer.reject()
            }
            this.endpoints.delete(nodeId)
            logger.trace(nodeId + ' deleted connection in onDisconnected() gracefulLeave: ' + gracefulLeave)
            this.emit('disconnected', peerDescriptor, gracefulLeave)
            this.onConnectionCountChange()
        }
    }

    private onNewConnection(connection: PendingConnection): boolean {
        if (this.state === ConnectionManagerState.STOPPED) {
            return false
        }
        logger.trace('onNewConnection()')
        if (!this.acceptNewConnection(connection)) {
            return false
        }
        connection.on('disconnected', (gracefulLeave: boolean) => this.onDisconnected(connection.getPeerDescriptor(), gracefulLeave))
        return true
    }

    private acceptNewConnection(newConnection: PendingConnection): boolean {
        const nodeId = getNodeIdFromPeerDescriptor(newConnection.getPeerDescriptor())
        logger.trace(nodeId + ' acceptIncomingConnection()')
        if (this.endpoints.has(nodeId)) {
            if (getOfferer(getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor()), nodeId) === 'remote') {
                if (this.endpoints.get(nodeId)!.connected) {
                    logger.fatal('REPLACING CONNECTED CONNECTION')
                    // replace the current connection
                }
                const endpoint = this.endpoints.get(nodeId)! as ConnectingEndpoint
                const buffer = endpoint.buffer
                const oldConnection = endpoint.connection
                logger.trace('replaced: ' + nodeId)

                oldConnection.replaceAsDuplicate()
                this.endpoints.set(nodeId, { connected: false, connection: newConnection, buffer })
                return true
            } else {
                return false
            }
        }

        logger.trace(nodeId + ' added to connections at acceptIncomingConnection')
        this.endpoints.set(nodeId, {
            connected: false,
            buffer: new OutputBuffer(),
            connection: newConnection
        })

        return true
    }

    private onHandshakeCompleted(peerDescriptor: PeerDescriptor, connection: IConnection) {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        if (this.endpoints.has(nodeId)) {
            this.onConnected(peerDescriptor, connection)
        } else {
            logger.fatal(`onHandshakeCompleted() did not have the id ${nodeId}`)
        }
    }

    private async closeConnection(peerDescriptor: PeerDescriptor, gracefulLeave: boolean, reason?: string): Promise<void> {
        const nodeId = getNodeIdFromPeerDescriptor(peerDescriptor)
        logger.trace(nodeId + ' ' + 'closeConnection() ' + reason)
        this.locks.clearAllLocks(nodeId)
        if (this.endpoints.has(nodeId)) {
            const connectionToClose = this.endpoints.get(nodeId)!.connection
            await connectionToClose.close(gracefulLeave)
        } else {
            logger.trace(nodeId + ' ' + 'closeConnection() this.endpoints did not have the id')
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
        if (this.endpoints.has(nodeId)) {
            rpcRemote.unlockRequest(lockId)
        }
    }

    public weakLockConnection(nodeId: DhtAddress, lockId: LockID): void {
        if (this.state === ConnectionManagerState.STOPPED || (nodeId === getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor()))) {
            return
        }
        this.locks.addWeakLocked(nodeId, lockId)
    }

    public weakUnlockConnection(nodeId: DhtAddress, lockId: LockID): void {
        if (this.state === ConnectionManagerState.STOPPED || (nodeId === getNodeIdFromPeerDescriptor(this.getLocalPeerDescriptor()))) {
            return
        }
        this.locks.removeWeakLocked(nodeId, lockId)
    }

    private async gracefullyDisconnectAsync(targetDescriptor: PeerDescriptor, disconnectMode: DisconnectMode): Promise<void> {
        const endpoint = this.endpoints.get(getNodeIdFromPeerDescriptor(targetDescriptor))

        if (!endpoint) {
            logger.debug('gracefullyDisconnectedAsync() tried on a non-existing connection')
            return
        }

        if (endpoint.connected) {
            const connection = endpoint.connection
            const promise = new Promise<void>((resolve, _reject) => {
                // TODO use config option or named constant?
                // eslint-disable-next-line promise/catch-or-return
                waitForEvent3<ManagedConnectionEvents>(connection, 'disconnected', 2000).then(() => {
                    logger.trace('disconnected event received in gracefullyDisconnectAsync()')
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
        } else {
            endpoint.connection.close(true)
        }
        
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
        return Array.from(this.endpoints.values())
            .map((endpoint) => endpoint)
            // TODO is this filtering needed? (if it is, should we do the same filtering e.g.
            // in getConnection() or in other methods which access this.endpoints directly?)
            .filter((endpoint) => endpoint.connected)
            .map((endpoint) => endpoint.connection.getPeerDescriptor()!)
    }

    private onConnectionCountChange() {
        this.metrics.connectionAverageCount.record(this.endpoints.size)
    }
}
