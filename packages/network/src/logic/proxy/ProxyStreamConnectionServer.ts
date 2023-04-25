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
    direction: ProxyDirection // Direction is from the client's point of view
    userId: string
}

export class ProxyStreamConnectionServer {
    private readonly connections: Map<StreamPartID, Map<NodeId, ProxyConnection>>
    private readonly acceptProxyConnections: boolean
    private readonly streamPartManager: StreamPartManager
    private readonly nodeToNode: NodeToNode
    private readonly node: Node
    private readonly propagation: Propagation

    constructor(opts: ProxyStreamConnectionServerOptions) {
        this.streamPartManager = opts.streamPartManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.acceptProxyConnections = opts.acceptProxyConnections
        this.propagation = opts.propagation
        this.connections = new Map()
        this.nodeToNode.on(NodeToNodeEvent.PROXY_CONNECTION_REQUEST_RECEIVED, (message, nodeId) => {
            this.processHandshakeRequest(message, nodeId)
        })

        this.nodeToNode.on(NodeToNodeEvent.LEAVE_REQUEST_RECEIVED, (message, nodeId) => {
            this.processLeaveRequest(message, nodeId)
        })
    }

    private async processHandshakeRequest(message: ProxyConnectionRequest, nodeId: NodeId): Promise<void> {
        const streamPartId = message.getStreamPartID()
        const isAccepted = this.acceptProxyConnections && this.streamPartManager.isSetUp(streamPartId)
        await this.nodeToNode.respondToProxyConnectionRequest(nodeId, streamPartId, message.direction, isAccepted)
        if (isAccepted) {
            this.addConnection(streamPartId, nodeId, message.direction, message.userId)
            if (message.direction === ProxyDirection.PUBLISH) {
                this.streamPartManager.addInOnlyNeighbor(streamPartId, nodeId)
            } else {
                this.streamPartManager.addOutOnlyNeighbor(streamPartId, nodeId)
                this.propagation.onNeighborJoined(nodeId, streamPartId)
            }
        }
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
        this.removeConnection(streamPartId, nodeId)
        this.node.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, streamPartId)
        logger.info('Processed leave request by proxy node', {
            nodeId,
            streamPartId
        })
    }

    private removeConnection(streamPartId: StreamPartID, nodeId: NodeId): void {
        if (this.hasConnection(streamPartId, nodeId)) {
            this.connections.get(streamPartId)!.delete(nodeId)
            if (this.connections.get(streamPartId)!.size === 0) {
                this.connections.delete(streamPartId)
            }
            this.streamPartManager.removeNodeFromStreamPart(streamPartId, nodeId)
        }
    }

    private hasConnection(streamPartId: StreamPartID, nodeId: NodeId): boolean {
        return this.connections.has(streamPartId) && this.connections.get(streamPartId)!.has(nodeId)
    }

    public getNodeIdsForUserId(streamPartId: StreamPartID, userId: string): NodeId[] {
        const connections = this.connections.get(streamPartId)
        return connections ? Array.from(connections.keys()).filter((nodeId) => connections.get(nodeId)!.userId === userId) : []
    }

    stop(): void {
        this.connections.clear()
    }
}
