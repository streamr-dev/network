import { TrackerManager } from '../TrackerManager'
import { StreamPartManager } from '../StreamPartManager'
import { NodeToNode } from '../../protocol/NodeToNode'
import { NodeId } from '../../identifiers'
import { Event, Node } from '../Node'
import {
    ProxyConnectionResponse,
    ProxyDirection,
    StreamPartID,
    UnsubscribeRequest
} from '@streamr/protocol'
import { Logger, withTimeout } from "@streamr/utils"
import { Propagation } from '../propagation/Propagation'

const logger = new Logger(module)

export interface ProxyStreamConnectionClientOptions {
    trackerManager: TrackerManager
    streamPartManager: StreamPartManager
    nodeToNode: NodeToNode
    propagation: Propagation
    node: Node
    nodeConnectTimeout: number
}

enum State {
    NEGOTIATING,
    ACCEPTED,
    RENEGOTIATING
}

interface ProxyConnection {
    state?: State
    reconnectionTimer?: NodeJS.Timeout
    direction: ProxyDirection
    userId: string
}

interface ProxyTargets {
    candidates: NodeId[]
    numOfTargets: number
    connections: Map<NodeId, ProxyConnection>
}

const DEFAULT_RECONNECTION_TIMEOUT = 10 * 1000

export class ProxyStreamConnectionClient {
    private readonly trackerManager: TrackerManager
    private readonly streamPartManager: StreamPartManager
    private readonly nodeToNode: NodeToNode
    private readonly node: Node
    private readonly nodeConnectTimeout: number
    private readonly propagation: Propagation
    private readonly proxyTargets: Map<StreamPartID, ProxyTargets>

    constructor(opts: ProxyStreamConnectionClientOptions) {
        this.trackerManager = opts.trackerManager
        this.streamPartManager = opts.streamPartManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.nodeConnectTimeout = opts.nodeConnectTimeout
        this.propagation = opts.propagation
        this.proxyTargets = new Map()
    }

    private addConnection(streamPartId: StreamPartID, nodeId: NodeId, direction: ProxyDirection, userId: string): void {
        if (!this.proxyTargets.has(streamPartId)) {
            this.proxyTargets.set(streamPartId, new Map())
        }
        this.proxyTargets.get(streamPartId)!.set(nodeId, {
            state: State.NEGOTIATING,
            direction,
            userId
        })
    }

    private removeConnection(streamPartId: StreamPartID, nodeId: NodeId): void {
        if (this.proxyTargets.has(streamPartId)) {
            this.proxyTargets.get(streamPartId)!.delete(nodeId)
            if (this.proxyTargets.get(streamPartId)!.size === 0) {
                this.proxyTargets.delete(streamPartId)
            }
        }

        this.streamPartManager.removeNodeFromStreamPart(streamPartId, nodeId)
        // Finally if the stream has no neighbors or in/out connections, remove the stream
        if (this.streamPartManager.getAllNodesForStreamPart(streamPartId).length === 0
            && !this.proxyTargets.has(streamPartId)
            && this.streamPartManager.isBehindProxy(streamPartId)
        ) {
            this.streamPartManager.removeStreamPart(streamPartId)
        }
    }

    public addProxyTargets(streamPartId: StreamPartID, nodeIds: NodeId[], numOfTargets?: number): void {
        if (!this.proxyTargets.has(streamPartId)) {
            this.proxyTargets.set(streamPartId, {
                connections: new Map(),
                numOfTargets: numOfTargets ? numOfTargets : nodeIds.length,
                candidates: nodeIds
            })
        }
    }

    setTargetConnectionCount(streamPartId: StreamPartID, count: number): void {
        if (this.proxyTargets.has(streamPartId)) {
            this.proxyTargets.get(streamPartId)!.numOfTargets = count
        }
    }

    private hasConnection(nodeId: NodeId, streamPartId: StreamPartID): boolean {
        if (!this.proxyTargets.has(streamPartId)) {
            return false
        }
        return this.proxyTargets.get(streamPartId)!.connections.has(nodeId)
    }

    private getConnection(nodeId: NodeId, streamPartId: StreamPartID): ProxyConnection | undefined {
        return this.proxyTargets.get(streamPartId)?.connections.get(nodeId)!
    }

    async openProxyConnection(streamPartId: StreamPartID, targetNodeId: string, direction: ProxyDirection, userId: string): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        try {
            if (!this.streamPartManager.isSetUp(streamPartId)) {
                this.streamPartManager.setUpStreamPart(streamPartId, true)
            } else if (!this.streamPartManager.isBehindProxy(streamPartId)) {
                const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, bidirectional stream already exists`
                logger.warn(reason)
                this.node.emit(Event.PROXY_CONNECTION_REJECTED, targetNodeId, streamPartId, direction, reason)
                return
            } else if (this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)) {
                const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, proxy stream connection already exists`
                logger.warn(reason)
                this.node.emit(Event.PROXY_CONNECTION_REJECTED, targetNodeId, streamPartId, direction, reason)
                return
            } else if (this.hasConnection(targetNodeId, streamPartId)) {
                const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, a connection already exists`
                logger.warn(reason)
                return
            }
            this.addConnection(streamPartId, targetNodeId, direction, userId)
            await this.connectAndNegotiate(streamPartId, targetNodeId, direction, userId)
        } catch (err) {
            logger.warn(`Failed to create a proxy ${direction} stream connection to ${targetNodeId} for stream ${streamPartId}:\n${err}`)
            this.removeConnection(streamPartId, targetNodeId)
            this.node.emit( Event.PROXY_CONNECTION_REJECTED, targetNodeId, streamPartId, direction, err)
        } finally {
            this.trackerManager.disconnectFromSignallingOnlyTracker(trackerId)
        }
    }

    private async connectAndNegotiate(streamPartId: StreamPartID, targetNodeId: NodeId, direction: ProxyDirection, userId: string): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        const trackerAddress = this.trackerManager.getTrackerAddress(streamPartId)

        await this.trackerManager.connectToSignallingOnlyTracker(trackerId, trackerAddress)
        await withTimeout(this.nodeToNode.connectToNode(targetNodeId, trackerId, false), this.nodeConnectTimeout)
        await this.nodeToNode.requestProxyConnection(targetNodeId, streamPartId, direction, userId)

    }

    async closeProxyConnection(streamPartId: StreamPartID, targetNodeId: NodeId, direction: ProxyDirection): Promise<void> {
        if (this.streamPartManager.isSetUp(streamPartId)
            && this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)
            && this.getConnection(targetNodeId, streamPartId)?.direction === direction) {
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
        }
        logger.info(`Proxy node ${nodeId} closed one-way stream connection for ${streamPartId}`)
    }

    processProxyConnectionResponse(message: ProxyConnectionResponse, nodeId: NodeId): void {
        const streamPartId = message.getStreamPartID()
        if (message.accepted) {
            this.getConnection(nodeId, streamPartId)!.state = State.ACCEPTED
            if (message.direction === ProxyDirection.PUBLISH) {
                this.streamPartManager.addOutOnlyNeighbor(streamPartId, nodeId)
                this.propagation.onNeighborJoined(nodeId, streamPartId)
            } else {
                this.streamPartManager.addInOnlyNeighbor(streamPartId, nodeId)
            }
            this.node.emit(Event.PROXY_CONNECTION_ACCEPTED, nodeId, streamPartId, message.direction)

        } else {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(
                Event.PROXY_CONNECTION_REJECTED,
                nodeId,
                streamPartId,
                message.direction,
                `Target node ${nodeId} rejected proxy ${message.direction} stream connection ${streamPartId}`
            )
        }
    }

    async reconnect(targetNodeId: NodeId, streamPartId: StreamPartID): Promise<void> {
        if (!this.hasConnection(targetNodeId, streamPartId)) {
            logger.trace(`Cannot reconnect to a non-existing proxy connection on ${targetNodeId} ${streamPartId}`)
            return
        }
        const connection = this.getConnection(targetNodeId, streamPartId)!
        if (connection.state !== State.RENEGOTIATING) {
            connection.state = State.RENEGOTIATING
        }
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        try {
            await this.connectAndNegotiate(streamPartId, targetNodeId, connection.direction, connection.userId)
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

    isProxiedStreamPart(streamPartId: StreamPartID, direction: ProxyDirection): boolean {
        if (this.connections.get(streamPartId) && [...this.proxyTargets.get(streamPartId)!.values()].length > 0) {
            return [...this.proxyTargets.get(streamPartId)!.values()][0].direction === direction
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
