import { StreamPartManager } from '../StreamPartManager'
import { Event as NodeToNodeEvent, NodeToNode } from '../../protocol/NodeToNode'
import { NodeId } from '../../identifiers'
import { Event, Node } from '../Node'
import {
    ProxyConnectionRequest,
    ProxyDirection,
    StreamPartID,
    UnsubscribeRequest
} from '@streamr/protocol'
import { Logger } from "@streamr/utils"
import { Propagation } from '../propagation/Propagation'

const logger = new Logger(module)

export interface ProxyStreamConnectionServerOptions {
    streamPartManager: StreamPartManager
    nodeToNode: NodeToNode
    propagation: Propagation
    node: Node
    acceptProxyConnections: boolean
}

interface ProxyConnection {
    direction: ProxyDirection
    userId: string
}

export class ProxyStreamConnectionServer {
    private readonly streamPartManager: StreamPartManager
    private readonly nodeToNode: NodeToNode
    private readonly node: Node
    private readonly acceptProxyConnections: boolean
    private readonly connections: Map<StreamPartID, Map<NodeId, ProxyConnection>>
    private readonly propagation: Propagation

    constructor(opts: ProxyStreamConnectionServerOptions) {
        this.streamPartManager = opts.streamPartManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.acceptProxyConnections = opts.acceptProxyConnections
        this.propagation = opts.propagation
        this.connections = new Map()
        this.nodeToNode.on(NodeToNodeEvent.PROXY_CONNECTION_REQUEST_RECEIVED, (message,  nodeId) => {
            this.processHandshakeRequest(message, nodeId)
        })

        this.nodeToNode.on(NodeToNodeEvent.LEAVE_REQUEST_RECEIVED, (message, nodeId) => {
            this.processLeaveRequest(message, nodeId)
        })
    }

    private async processHandshakeRequest(message: ProxyConnectionRequest, nodeId: NodeId): Promise<void> {
        const streamPartId = message.getStreamPartID()
        const isAccepted = this.streamPartManager.isSetUp(streamPartId) && this.acceptProxyConnections
        if (isAccepted) {
            if (message.direction === ProxyDirection.PUBLISH) {
                this.streamPartManager.addInOnlyNeighbor(streamPartId, nodeId)
                this.addConnection(streamPartId, nodeId, ProxyDirection.PUBLISH, message.userId)
            } else {
                this.streamPartManager.addOutOnlyNeighbor(streamPartId, nodeId)
                this.addConnection(streamPartId, nodeId, ProxyDirection.SUBSCRIBE, message.userId)
                this.propagation.onNeighborJoined(nodeId, streamPartId) // TODO: maybe should not be marked as full propagation in Propagation.ts?
            }
        }
        await this.nodeToNode.respondToProxyConnectionRequest(nodeId, streamPartId, message.direction, isAccepted)
    }

    private addConnection(streamPartId: StreamPartID, nodeId: NodeId, direction: ProxyDirection, userId: string): void {
        if (!this.connections.has(streamPartId)) {
            this.connections.set(streamPartId, new Map())
        }
        this.connections.get(streamPartId)!.set(nodeId, {
            direction,
            userId
        })
    }

    private processLeaveRequest(message: UnsubscribeRequest, nodeId: NodeId): void {
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

    private removeConnection(streamPartId: StreamPartID, nodeId: NodeId): void {
        if (this.connections.has(streamPartId)) {
            this.connections.get(streamPartId)!.delete(nodeId)
            if (this.connections.get(streamPartId)!.size === 0) {
                this.connections.delete(streamPartId)
            }
        }

        this.streamPartManager.removeNodeFromStreamPart(streamPartId, nodeId)
    }

    public getNodeIdsForUserId(streamPartId: StreamPartID, userId: string): NodeId[] {
        const connections = this.connections.get(streamPartId)!
        const returnedNodeIds: NodeId[] = []
        connections.forEach((connection, nodeId) => {
            if (connection.userId === userId) {
                returnedNodeIds.push(nodeId)
            }
        })
        return returnedNodeIds
    }

    stop(): void {
        this.connections.clear()
    }
}
