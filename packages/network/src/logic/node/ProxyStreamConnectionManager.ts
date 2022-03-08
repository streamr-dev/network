import { TrackerManager } from './TrackerManager'
import { StreamPartManager } from './StreamPartManager'
import { NodeToNode } from '../../protocol/NodeToNode'
import { Event, Node, NodeId } from './Node'
import {
    ProxyPublishStreamConnectionRequest,
    ProxyPublishStreamConnectionResponse,
    ProxySubscribeStreamConnectionResponse,
    ProxySubscribeStreamConnectionRequest,
    StreamPartID,
    UnsubscribeRequest
} from 'streamr-client-protocol'
import { promiseTimeout } from '../../helpers/PromiseTools'
import { Logger } from '../../helpers/logger/LoggerNode'
const logger = new Logger(module)

export interface ProxyStreamConnectionManagerOptions {
    trackerManager: TrackerManager,
    streamPartManager: StreamPartManager,
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

export enum Direction {
    PUBLISHER = 'publisher',
    SUBSCRIBER = 'subscriber'
}

interface ProxyConnection {
    state?: State,
    reconnectionTimer?: NodeJS.Timeout,
    direction: Direction
}

const DEFAULT_RECONNECTION_TIMEOUT = 10 * 1000

export class ProxyStreamConnectionManager {
    private readonly trackerManager: TrackerManager
    private readonly streamPartManager: StreamPartManager
    private readonly nodeToNode: NodeToNode
    private readonly node: Node
    private readonly nodeConnectTimeout: number
    private readonly acceptProxyConnections: boolean
    private readonly connections: Map<StreamPartID, Map<NodeId, ProxyConnection>>

    constructor(opts: ProxyStreamConnectionManagerOptions) {
        this.trackerManager = opts.trackerManager
        this.streamPartManager = opts.streamPartManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.nodeConnectTimeout = opts.nodeConnectTimeout
        this.acceptProxyConnections = opts.acceptProxyConnections
        this.connections = new Map()
    }

    private addConnection(streamPartId: StreamPartID, nodeId: NodeId, direction: Direction): void {
        if (!this.connections.has(streamPartId)) {
            this.connections.set(streamPartId, new Map())
        }
        this.connections.get(streamPartId)!.set(nodeId, {
            state: State.NEGOTIATING,
            direction
        })
    }

    private removeConnection(streamPartId: StreamPartID, nodeId: NodeId): void {
        if (this.connections.has(streamPartId)) {
            this.connections.get(streamPartId)!.delete(nodeId)
            if (this.connections.get(streamPartId)!.size === 0) {
                this.connections.delete(streamPartId)
            }
        }

        this.streamPartManager.removeNodeFromStreamPart(streamPartId, nodeId)
        // Finally if the stream has no neighbors or in/out connections, remove the stream
        if (this.streamPartManager.getAllNodesForStreamPart(streamPartId).length === 0
            && !this.connections.has(streamPartId)
            && this.streamPartManager.isBehindProxy(streamPartId)
        ) {
            this.streamPartManager.removeStreamPart(streamPartId)
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

    async openProxyStreamConnection(streamPartId: StreamPartID, targetNodeId: string, direction: Direction): Promise<void> {
        const rejectEvent = direction === Direction.PUBLISHER ? Event.PROXY_PUBLISH_STREAM_REJECTED : Event.PROXY_SUBSCRIBE_STREAM_REJECTED
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        try {
            if (!this.streamPartManager.isSetUp(streamPartId)) {
                this.streamPartManager.setUpStreamPart(streamPartId, true)
            } else if (!this.streamPartManager.isBehindProxy(streamPartId)) {
                const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, bidirectional stream already exists`
                logger.warn(reason)
                this.node.emit(rejectEvent, targetNodeId, streamPartId, reason)
                return
            } else if (this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)) {
                const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, proxy stream connection already exists`
                logger.warn(reason)
                this.node.emit(rejectEvent, targetNodeId, streamPartId, reason)
                return
            } else if (this.hasConnection(targetNodeId, streamPartId)) {
                const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, a connection already exists`
                logger.warn(reason)
                return
            }
            this.addConnection(streamPartId, targetNodeId, direction)
            await this.connectAndNegotiate(streamPartId, targetNodeId, direction)
        } catch (err) {
            logger.warn(`Failed to create a proxy ${direction} stream connection to ${targetNodeId} for stream ${streamPartId}:\n${err}`)
            this.removeConnection(streamPartId, targetNodeId)
            this.node.emit(rejectEvent, targetNodeId, streamPartId, err)
        } finally {
            this.trackerManager.disconnectFromSignallingOnlyTracker(trackerId)
        }
    }

    private async connectAndNegotiate(streamPartId: StreamPartID, targetNodeId: NodeId, direction: Direction): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        const trackerAddress = this.trackerManager.getTrackerAddress(streamPartId)

        await this.trackerManager.connectToSignallingOnlyTracker(trackerId, trackerAddress)
        await promiseTimeout(this.nodeConnectTimeout, this.nodeToNode.connectToNode(targetNodeId, trackerId, false))
        if (direction === Direction.PUBLISHER) {
            await this.nodeToNode.requestProxyPublishStreamConnection(targetNodeId, streamPartId)
        } else {
            await this.nodeToNode.requestProxySubscribeStreamConnection(targetNodeId, streamPartId)
        }
    }

    async closeOnewayStreamConnection(streamPartId: StreamPartID, targetNodeId: NodeId, direction: Direction): Promise<void> {
        if (this.streamPartManager.isSetUp(streamPartId)
            && this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)
            && this.getConnection(targetNodeId, streamPartId)?.direction === direction)
        {
            clearTimeout(this.getConnection(targetNodeId, streamPartId)!.reconnectionTimer!)
            this.removeConnection(streamPartId, targetNodeId)
            await this.nodeToNode.leaveStreamOnNode(targetNodeId, streamPartId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, targetNodeId, streamPartId)
        } else {
            const reason = `A proxy ${direction} stream connection for ${streamPartId} on node ${targetNodeId} does not exist`
            logger.warn(reason)
            throw reason
        }
    }

    processLeaveRequest(message: UnsubscribeRequest, nodeId: NodeId): void {
        const streamPartId = message.getStreamPartID()
        if (this.streamPartManager.isSetUp(streamPartId) && this.streamPartManager.hasInOnlyConnection(streamPartId, nodeId)) {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, streamPartId)
        }
        if (this.streamPartManager.isSetUp(streamPartId) && this.streamPartManager.hasOutOnlyConnection(streamPartId, nodeId)) {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, streamPartId)
            logger.info(`Proxy node ${nodeId} closed one-way stream connection for ${streamPartId}`)
        }
    }

    async processPublishStreamRequest(message: ProxyPublishStreamConnectionRequest, nodeId: string): Promise<void> {
        const streamPartId = message.getStreamPartID()

        // More conditions could be added here, ie. a list of acceptable ids or max limit for number of one-way this
        const isAccepted = this.streamPartManager.isSetUp(streamPartId) && this.acceptProxyConnections
        if (isAccepted) {
            this.streamPartManager.addInOnlyNeighbor(streamPartId, nodeId)
        }
        await this.nodeToNode.respondToProxyPublishStreamConnectionRequest(nodeId, streamPartId, isAccepted)
    }

    processPublishStreamResponse(message: ProxyPublishStreamConnectionResponse, nodeId: string): void {
        const streamPartId = message.getStreamPartID()
        if (message.accepted) {
            this.getConnection(nodeId, streamPartId)!.state = State.ACCEPTED
            this.streamPartManager.addOutOnlyNeighbor(streamPartId, nodeId)
            this.node.emit(Event.PROXY_PUBLISH_STREAM_ACCEPTED, nodeId, streamPartId)
        } else {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(
                Event.PROXY_PUBLISH_STREAM_REJECTED,
                nodeId,
                streamPartId,
                `Target node ${nodeId} rejected publish only stream connection ${streamPartId}`
            )
        }
    }

    async processSubscribeStreamRequest(message: ProxySubscribeStreamConnectionRequest, nodeId: string): Promise<void> {
        const streamPartId = message.getStreamPartID()

        // More conditions could be added here, ie. a list of acceptable ids or max limit for number of one-way this
        const isAccepted = this.streamPartManager.isSetUp(streamPartId) && this.acceptProxyConnections
        if (isAccepted) {
            this.streamPartManager.addOutOnlyNeighbor(streamPartId, nodeId)
        }
        await this.nodeToNode.respondToProxySubscribeStreamConnectionRequest(nodeId, streamPartId, isAccepted)
    }

    processSubscribeStreamResponse(message: ProxySubscribeStreamConnectionResponse, nodeId: string): void {
        const streamPartId = message.getStreamPartID()
        if (message.accepted) {
            this.getConnection(nodeId, streamPartId)!.state = State.ACCEPTED
            this.streamPartManager.addInOnlyNeighbor(streamPartId, nodeId)
            this.node.emit(Event.PROXY_SUBSCRIBE_STREAM_ACCEPTED, nodeId, streamPartId)
        } else {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(
                Event.PROXY_SUBSCRIBE_STREAM_REJECTED,
                nodeId,
                streamPartId,
                `Target node ${nodeId} rejected subscribe only stream connection ${streamPartId}`
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
            await this.connectAndNegotiate(streamPartId, targetNodeId, connection.direction)
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

    isSubscribeOnlyStream(streamPartId: StreamPartID): boolean {
        if (this.connections.get(streamPartId) && [...this.connections.get(streamPartId)!.values()].length > 0) {
            return [...this.connections.get(streamPartId)!.values()][0].direction === Direction.SUBSCRIBER
        }
        return false
    }

    isPublishOnlyStream(streamPartId: StreamPartID): boolean {
        if (this.connections.get(streamPartId) && [...this.connections.get(streamPartId)!.values()].length > 0) {
            return [...this.connections.get(streamPartId)!.values()][0].direction === Direction.PUBLISHER
        }
        return false
    }

    stop(): void {
        this.connections.forEach((streamPart: Map<NodeId, ProxyConnection>) => {
            streamPart.forEach((connection: ProxyConnection) => {
                if (connection.reconnectionTimer !== undefined) {
                    clearTimeout(connection.reconnectionTimer)
                }
            })
        })
        this.connections.clear()
    }
}