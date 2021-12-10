import { TrackerManager } from './TrackerManager'
import { StreamManager } from './StreamManager'
import { NodeToNode } from '../../protocol/NodeToNode'
import { Event, Node, NodeId } from './Node'
import {
    PublishStreamConnectionRequest,
    PublishStreamConnectionResponse,
    SPID,
    SPIDKey,
    UnsubscribeRequest
} from 'streamr-client-protocol'
import { promiseTimeout } from '../../helpers/PromiseTools'
import { Logger } from '../../helpers/logger/LoggerNode'
const logger = new Logger(module)

export interface ProxyStreamConnectionManagerOptions {
    trackerManager: TrackerManager,
    streamManager: StreamManager,
    nodeToNode: NodeToNode,
    node: Node,
    nodeConnectTimeout: number,
    acceptProxyConnections: boolean
}

enum State {
    CONNECTING,
    CONNECTED,
    RECONNECTING
}

interface ProxyConnection {
    state?: State,
    reconnectionTimer?: NodeJS.Timeout
}

const DEFAULT_RECONNECTION_TIMEOUT = 10 * 1000

export class ProxyStreamConnectionManager {
    private readonly trackerManager: TrackerManager
    private readonly streamManager: StreamManager
    private readonly nodeToNode: NodeToNode
    private readonly node: Node
    private readonly nodeConnectTimeout: number
    private readonly acceptProxyConnections: boolean
    private readonly connections: Map<SPIDKey, Map<NodeId, ProxyConnection>>

    constructor(opts: ProxyStreamConnectionManagerOptions) {
        this.trackerManager = opts.trackerManager
        this.streamManager = opts.streamManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.nodeConnectTimeout = opts.nodeConnectTimeout
        this.acceptProxyConnections = opts.acceptProxyConnections
        this.connections = new Map()
    }

    addConnection(spid: SPID, nodeId: NodeId): void {
        if (!this.connections.has(spid.key)) {
            this.connections.set(spid.key, new Map())
        }
        this.connections.get(spid.key)!.set(nodeId, {
            state: State.CONNECTING
        })
    }

    removeConnection(spid: SPID, nodeId: NodeId): void {
        if (this.connections.has(spid.key)) {
            this.connections.get(spid.key)!.delete(nodeId)
            if ([...this.connections.get(spid.key)!].length === 0) {
                this.connections.delete(spid.key)
            }
        }

        this.streamManager.removeNodeFromStream(spid, nodeId)
        if (this.streamManager.isSetUp(spid)
            && this.streamManager.getAllNodesForStream(spid).length === 0
            && !this.connections.has(spid.key)
            && this.streamManager.isBehindProxy(spid)
        ) {
            this.streamManager.removeStream(spid)
        }
    }

    private hasConnection(nodeId: NodeId, spid: SPID): boolean {
        return this.connections.get(spid.key)!.has(nodeId)
    }

    private getConnection(nodeId: NodeId, spid: SPID): ProxyConnection | undefined {
        return this.connections.get(spid.key)!.get(nodeId)!
    }

    async openOutgoingStreamConnection(spid: SPID, targetNodeId: string): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(spid)
        const trackerAddress = this.trackerManager.getTrackerAddress(spid)
        try {
            if (!this.streamManager.isSetUp(spid)) {
                this.streamManager.setUpStream(spid, true)
            } else if (this.streamManager.isSetUp(spid) && !this.streamManager.isBehindProxy(spid)) {
                const reason = `Could not open a proxy outgoing stream connection ${spid.key}, bidirectional stream already exists`
                logger.warn(reason)
                this.node.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, spid, reason)
                return
            } else if (this.streamManager.isSetUp(spid) && this.streamManager.hasOutOnlyConnection(spid, targetNodeId)) {
                const reason = `Could not open a proxy outgoing stream connection ${spid.key}, proxy stream connection already exists`
                logger.warn(reason)
                this.node.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, spid, reason)
                return
            } else if (this.streamManager.isSetUp(spid) && this.hasConnection(targetNodeId, spid)) {
                const reason = `Could not open a proxy outgoing stream connection ${spid.key}, a connection already exists`
                logger.warn(reason)
                return
            }
            this.addConnection(spid, targetNodeId)
            await this.trackerManager.connectToSignallingOnlyTracker(trackerId, trackerAddress)
            await promiseTimeout(this.nodeConnectTimeout, this.nodeToNode.connectToNode(targetNodeId, trackerId, false))
            await this.nodeToNode.requestPublishOnlyStreamConnection(targetNodeId, spid)
        } catch (err) {
            logger.warn(`Failed to create a proxy outgoing stream connection to ${targetNodeId} for stream ${spid.key}:\n${err}`)
            this.removeConnection(spid, targetNodeId)
            this.node.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, spid, err)
        } finally {
            this.trackerManager.disconnectFromSignallingOnlyTracker(trackerId)
        }
    }

    async closeOutgoingStreamConnection(spid: SPID, targetNodeId: NodeId): Promise<void> {
        if (this.streamManager.isSetUp(spid) && this.streamManager.hasOutOnlyConnection(spid, targetNodeId)) {
            clearTimeout(this.getConnection(targetNodeId, spid)!.reconnectionTimer!)
            await this.nodeToNode.leaveStreamOnNode(targetNodeId, spid)
            this.removeConnection(spid, targetNodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, targetNodeId, spid)
        } else {
            logger.warn(`A proxy outgoing stream connection for ${spid.key} on node ${targetNodeId} does not exist`)
        }
    }

    processLeaveRequest(message: UnsubscribeRequest, nodeId: NodeId): void {
        const { streamId, streamPartition } = message
        const spid = new SPID(streamId, streamPartition)
        if (this.streamManager.isSetUp(spid) && this.streamManager.hasInOnlyConnection(spid, nodeId)) {
            this.removeConnection(spid, nodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, spid)
        }
        if (this.streamManager.isSetUp(spid) && this.streamManager.hasOutOnlyConnection(spid, nodeId)) {
            this.removeConnection(spid, nodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, spid)
            logger.info(`Proxy node ${nodeId} closed one-way stream connection for ${spid}`)
        }
    }

    async processPublishStreamRequest(message: PublishStreamConnectionRequest, nodeId: string): Promise<void> {
        const { streamId, streamPartition } = message
        const spid = new SPID(streamId, streamPartition)

        // More conditions could be added here, ie. a list of acceptable ids or max limit for number of one-way this
        const isAccepted = this.streamManager.isSetUp(spid) && this.acceptProxyConnections
        if (isAccepted) {
            this.streamManager.addInOnlyNeighbor(spid, nodeId)
        }
        return await this.nodeToNode.respondToPublishOnlyStreamConnectionRequest(nodeId, spid, isAccepted)
    }

    processPublishStreamResponse(message: PublishStreamConnectionResponse, nodeId: string): void {
        const { streamId, streamPartition, accepted } = message
        const spid = new SPID(streamId, streamPartition)
        if (accepted) {
            this.getConnection(nodeId, spid)!.state = State.CONNECTED
            this.streamManager.addOutOnlyNeighbor(spid, nodeId)
            this.node.emit(Event.PUBLISH_STREAM_ACCEPTED, nodeId, spid)
        } else {
            this.removeConnection(spid, nodeId)
            this.node.emit(Event.PUBLISH_STREAM_REJECTED, nodeId, spid, `Target node ${nodeId} rejected publish only stream connection ${spid.key}`)
        }
    }

    async reconnect(targetNodeId: NodeId, spid: SPID): Promise<void> {
        const connection = this.getConnection(targetNodeId, spid)!
        if (connection.state !== State.RECONNECTING) {
            connection.state = State.RECONNECTING
        }
        const trackerId = this.trackerManager.getTrackerId(spid)
        const trackerAddress = this.trackerManager.getTrackerAddress(spid)
        try {
            await this.trackerManager.connectToSignallingOnlyTracker(trackerId, trackerAddress)
            await promiseTimeout(this.nodeConnectTimeout, this.nodeToNode.connectToNode(targetNodeId, trackerId, false))
            await this.nodeToNode.requestPublishOnlyStreamConnection(targetNodeId, spid)
            logger.trace(`Successful proxy stream reconnection to ${targetNodeId}`)
            connection.state = State.CONNECTED
            if (connection.reconnectionTimer !== undefined) {
                clearTimeout(connection.reconnectionTimer)
            }
        } catch (err) {
            logger.warn(`Proxy stream reconnection attempt to ${targetNodeId} failed with error: ${err}`)
            connection.reconnectionTimer = setTimeout( async () => {
                await this.reconnect(targetNodeId, spid)
            }, DEFAULT_RECONNECTION_TIMEOUT)
        } finally {
            this.trackerManager.disconnectFromSignallingOnlyTracker(trackerId)
        }
    }

    stop(): void {
        this.connections.forEach((stream: Map<NodeId, ProxyConnection>) => {
            stream.forEach((connection: ProxyConnection) => {
                if (connection.reconnectionTimer !== undefined) {
                    clearTimeout(connection.reconnectionTimer)
                }
            })
        })
    }
}