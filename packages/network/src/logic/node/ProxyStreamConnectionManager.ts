import { TrackerManager } from './TrackerManager'
import { StreamManager } from './StreamManager'
import { NodeToNode } from '../../protocol/NodeToNode'
import { Event, Node, NodeId } from './Node'
import {
    PublishStreamConnectionRequest,
    PublishStreamConnectionResponse,
    StreamPartID,
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
    NEGOTIATING,
    ACCEPTED,
    RENEGOTIATING
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
    private readonly connections: Map<StreamPartID, Map<NodeId, ProxyConnection>>

    constructor(opts: ProxyStreamConnectionManagerOptions) {
        this.trackerManager = opts.trackerManager
        this.streamManager = opts.streamManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.nodeConnectTimeout = opts.nodeConnectTimeout
        this.acceptProxyConnections = opts.acceptProxyConnections
        this.connections = new Map()
    }

    private addConnection(streamPartId: StreamPartID, nodeId: NodeId): void {
        if (!this.connections.has(streamPartId)) {
            this.connections.set(streamPartId, new Map())
        }
        this.connections.get(streamPartId)!.set(nodeId, {
            state: State.NEGOTIATING
        })
    }

    private removeConnection(streamPartId: StreamPartID, nodeId: NodeId): void {
        if (this.connections.has(streamPartId)) {
            this.connections.get(streamPartId)!.delete(nodeId)
            if (this.connections.get(streamPartId)!.size === 0) {
                this.connections.delete(streamPartId)
            }
        }

        this.streamManager.removeNodeFromStream(streamPartId, nodeId)
        // Finally if the stream has no neighbors or in/out connections, remove the stream
        if (this.streamManager.getAllNodesForStream(streamPartId).length === 0
            && !this.connections.has(streamPartId)
            && this.streamManager.isBehindProxy(streamPartId)
        ) {
            this.streamManager.removeStream(streamPartId)
        }
    }

    private hasConnection(nodeId: NodeId, streamPartId: StreamPartID): boolean {
        if (!this.connections.has(streamPartId)) {
            return false
        }
        return this.connections.get(streamPartId)!.has(nodeId)
    }

    private getConnection(nodeId: NodeId, streamPartId: StreamPartID): ProxyConnection | undefined {
        return this.connections.get(streamPartId)!.get(nodeId)!
    }

    async openOutgoingStreamConnection(streamPartId: StreamPartID, targetNodeId: string): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        try {
            if (!this.streamManager.isSetUp(streamPartId)) {
                this.streamManager.setUpStream(streamPartId, true)
            } else if (!this.streamManager.isBehindProxy(streamPartId)) {
                const reason = `Could not open a proxy outgoing stream connection ${streamPartId}, bidirectional stream already exists`
                logger.warn(reason)
                this.node.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, streamPartId, reason)
                return
            } else if (this.streamManager.hasOutOnlyConnection(streamPartId, targetNodeId)) {
                const reason = `Could not open a proxy outgoing stream connection ${streamPartId}, proxy stream connection already exists`
                logger.warn(reason)
                this.node.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, streamPartId, reason)
                return
            } else if (this.hasConnection(targetNodeId, streamPartId)) {
                const reason = `Could not open a proxy outgoing stream connection ${streamPartId}, a connection already exists`
                logger.warn(reason)
                return
            }
            this.addConnection(streamPartId, targetNodeId)
            await this.connectAndNegotiate(streamPartId, targetNodeId)
        } catch (err) {
            logger.warn(`Failed to create a proxy outgoing stream connection to ${targetNodeId} for stream ${streamPartId}:\n${err}`)
            this.removeConnection(streamPartId, targetNodeId)
            this.node.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, streamPartId, err)
        } finally {
            this.trackerManager.disconnectFromSignallingOnlyTracker(trackerId)
        }
    }

    private async connectAndNegotiate(streamPartId: StreamPartID, targetNodeId: NodeId): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        const trackerAddress = this.trackerManager.getTrackerAddress(streamPartId)

        await this.trackerManager.connectToSignallingOnlyTracker(trackerId, trackerAddress)
        await promiseTimeout(this.nodeConnectTimeout, this.nodeToNode.connectToNode(targetNodeId, trackerId, false))
        await this.nodeToNode.requestPublishOnlyStreamConnection(targetNodeId, streamPartId)
    }

    async closeOutgoingStreamConnection(streamPartId: StreamPartID, targetNodeId: NodeId): Promise<void> {
        if (this.streamManager.isSetUp(streamPartId) && this.streamManager.hasOutOnlyConnection(streamPartId, targetNodeId)) {
            clearTimeout(this.getConnection(targetNodeId, streamPartId)!.reconnectionTimer!)
            this.removeConnection(streamPartId, targetNodeId)
            await this.nodeToNode.leaveStreamOnNode(targetNodeId, streamPartId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, targetNodeId, streamPartId)
        } else {
            const reason = `A proxy outgoing stream connection for ${streamPartId} on node ${targetNodeId} does not exist`
            logger.warn(reason)
            throw reason
        }
    }

    processLeaveRequest(message: UnsubscribeRequest, nodeId: NodeId): void {
        const streamPartId = message.getStreamPartID()
        if (this.streamManager.isSetUp(streamPartId) && this.streamManager.hasInOnlyConnection(streamPartId, nodeId)) {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, streamPartId)
        }
        if (this.streamManager.isSetUp(streamPartId) && this.streamManager.hasOutOnlyConnection(streamPartId, nodeId)) {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, streamPartId)
            logger.info(`Proxy node ${nodeId} closed one-way stream connection for ${streamPartId}`)
        }
    }

    async processPublishStreamRequest(message: PublishStreamConnectionRequest, nodeId: string): Promise<void> {
        const streamPartId = message.getStreamPartID()

        // More conditions could be added here, ie. a list of acceptable ids or max limit for number of one-way this
        const isAccepted = this.streamManager.isSetUp(streamPartId) && this.acceptProxyConnections
        if (isAccepted) {
            this.streamManager.addInOnlyNeighbor(streamPartId, nodeId)
        }
        await this.nodeToNode.respondToPublishOnlyStreamConnectionRequest(nodeId, streamPartId, isAccepted)
    }

    processPublishStreamResponse(message: PublishStreamConnectionResponse, nodeId: string): void {
        const streamPartId = message.getStreamPartID()
        if (message.accepted) {
            this.getConnection(nodeId, streamPartId)!.state = State.ACCEPTED
            this.streamManager.addOutOnlyNeighbor(streamPartId, nodeId)
            this.node.emit(Event.PUBLISH_STREAM_ACCEPTED, nodeId, streamPartId)
        } else {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(
                Event.PUBLISH_STREAM_REJECTED,
                nodeId,
                streamPartId,
                `Target node ${nodeId} rejected publish only stream connection ${streamPartId}`
            )
        }
    }

    async reconnect(targetNodeId: NodeId, streamPartId: StreamPartID): Promise<void> {
        const connection = this.getConnection(targetNodeId, streamPartId)!
        if (connection.state !== State.RENEGOTIATING) {
            connection.state = State.RENEGOTIATING
        }
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        try {
            await this.connectAndNegotiate(streamPartId, targetNodeId)
            logger.trace(`Successful proxy stream reconnection to ${targetNodeId}`)
            connection.state = State.ACCEPTED
            if (connection.reconnectionTimer !== undefined) {
                clearTimeout(connection.reconnectionTimer)
            }
        } catch (err) {
            logger.warn(`Proxy stream reconnection attempt to ${targetNodeId} failed with error: ${err}`)
            connection.reconnectionTimer = setTimeout( async () => {
                await this.reconnect(targetNodeId, streamPartId)
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
        this.connections.clear()
    }
}