import { TrackerManager } from '../TrackerManager'
import { StreamPartManager } from '../StreamPartManager'
import { Event as NodeToNodeEvent, NodeToNode } from '../../protocol/NodeToNode'
import { NodeId } from '../../identifiers'
import { Node, Event as NodeEvent } from '../Node'
import {
    ProxyConnectionResponse,
    ProxyDirection,
    StreamPartID
} from '@streamr/protocol'
import { Logger, wait, withTimeout } from "@streamr/utils"
import { Propagation } from '../propagation/Propagation'
import { sampleSize } from 'lodash'
import { EventEmitter } from "events"

const logger = new Logger(module)

export interface ProxyStreamConnectionClientOptions {
    trackerManager: TrackerManager
    streamPartManager: StreamPartManager
    nodeToNode: NodeToNode
    propagation: Propagation
    node: Node
    nodeConnectTimeout: number
}

interface ProxyDefinition {
    nodeIds: Set<NodeId>
    connectionCount: number
    direction: ProxyDirection
    userId: string
}

export enum Event {
    CONNECTION_ACCEPTED = 'proxy-connection-accepted',
    CONNECTION_REJECTED = 'proxy-connection-rejected'
}

export interface ProxyStreamConnectionClient {
    on(event: Event.CONNECTION_ACCEPTED,
       listener: (nodeId: NodeId, streamPartId: StreamPartID, direction: ProxyDirection) => void): this
    on(event: Event.CONNECTION_REJECTED,
       listener: (nodeId: NodeId, streamPartId: StreamPartID, direction: ProxyDirection, reason?: string) => void): this
}

export const retry = async <T>(task: () => Promise<T>, description: string, abortSignal: AbortSignal, delay = 15000): Promise<T> => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            const result = await task()
            return result
        } catch (e: any) {
            logger.warn(`${description} failed, retrying in ${delay} ms`)
        }
        await wait(delay, abortSignal)
    }
}

export class ProxyStreamConnectionClient extends EventEmitter {
    private readonly trackerManager: TrackerManager
    private readonly streamPartManager: StreamPartManager
    private readonly nodeToNode: NodeToNode
    private readonly node: Node
    private readonly nodeConnectTimeout: number
    private readonly propagation: Propagation
    private readonly definitions: Map<StreamPartID, ProxyDefinition>
    private readonly abortController: AbortController
    private readonly connections: Map<StreamPartID, Map<NodeId, ProxyDirection>>

    constructor(opts: ProxyStreamConnectionClientOptions) {
        super()
        this.trackerManager = opts.trackerManager
        this.streamPartManager = opts.streamPartManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.nodeConnectTimeout = opts.nodeConnectTimeout
        this.propagation = opts.propagation
        this.definitions = new Map()
        this.connections = new Map()
        this.abortController = new AbortController()
        this.nodeToNode.on(NodeToNodeEvent.PROXY_CONNECTION_RESPONSE_RECEIVED, (message, nodeId) => {
            this.processHandshakeResponse(message, nodeId)
        })
    }

    public async setProxies(
        streamPartId: StreamPartID,
        nodeIds: NodeId[],
        direction: ProxyDirection,
        getUserId: () => Promise<string>,
        connectionCount?: number
    ): Promise<void> {
        logger.trace(`Set proxies on ${streamPartId}`)
        this.definitions.set(streamPartId, {
            nodeIds: new Set(nodeIds),
            userId: await getUserId(),
            direction,
            connectionCount: connectionCount ?? nodeIds.length
        })
        await this.updateConnections(streamPartId)
    }

    private async updateConnections(streamPartId: StreamPartID): Promise<void> {
        await Promise.all(this.getInvalidConnections(streamPartId).map(async (id) => {
            await this.closeConnection(streamPartId, id)
        }))
        const connectionCountDiff =  this.definitions.get(streamPartId)!.connectionCount - this.getConnections(streamPartId).size
        if (connectionCountDiff > 0) {
            await this.openRandomConnections(streamPartId, connectionCountDiff)
        } else if (connectionCountDiff < 0) {
            await this.closeRandomConnections(streamPartId, -connectionCountDiff)
        }
    }

    private getInvalidConnections(streamPartId: StreamPartID): string[] {
        return Array.from(this.getConnections(streamPartId).keys()).filter((id) =>
            !this.definitions.get(streamPartId)!.nodeIds.has(id)
            || this.definitions.get(streamPartId)!.direction !== this.getConnections(streamPartId).get(id)
        )
    }

    private async openRandomConnections(streamPartId: StreamPartID, connectionCount: number): Promise<void> {
        logger.debug(`Open ${connectionCount} random connections on ${streamPartId}`)
        const definition = this.definitions.get(streamPartId)!
        const proxiesToAttempt = sampleSize(Array.from(definition.nodeIds.keys()).filter((id) =>
            !this.getConnections(streamPartId).has(id)
        ), connectionCount).map((id) => id)
        await Promise.all(proxiesToAttempt.map((id) =>
            this.attemptConnection(streamPartId, id, definition.direction, definition.userId)
        ))
    }

    private async attemptConnection(streamPartId: StreamPartID, nodeId: NodeId, direction: ProxyDirection, userId: string): Promise<void> {
        await Promise.all([
            this.waitForHandshake(streamPartId, nodeId, direction),
            this.initiateConnection(streamPartId, nodeId, direction, userId)
        ])
    }

    private async waitForHandshake(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection): Promise<void> {
        let resolveHandler: any
        let rejectHandler: any
        await new Promise<void>((resolve, reject) => {
            resolveHandler = (node: string, stream: StreamPartID, eventDirection: ProxyDirection) => {
                if (node === contactNodeId && stream === streamPartId && direction === eventDirection) {
                    resolve()
                }
            }
            rejectHandler = (node: string, stream: StreamPartID, eventDirection: ProxyDirection, reason?: string) => {
                if (node === contactNodeId && stream === streamPartId && direction === eventDirection) {
                    reject(new Error(
                        `Joining stream as proxy ${direction} failed on contact-node ${contactNodeId} for stream ${streamPartId}`
                        + ` reason: ${reason}`
                    ))
                }
            }
            this.on(Event.CONNECTION_ACCEPTED, resolveHandler)
            this.on(Event.CONNECTION_REJECTED, rejectHandler)
        }).finally(() => {
            this.off(Event.CONNECTION_ACCEPTED, resolveHandler)
            this.off(Event.CONNECTION_REJECTED, rejectHandler)
        })
    }

    private async initiateConnection(
        streamPartId: StreamPartID,
        targetNodeId: string,
        direction: ProxyDirection,
        userId: string
    ): Promise<void> {
        if (!this.streamPartManager.isSetUp(streamPartId)) {
            this.streamPartManager.setUpStreamPart(streamPartId, true)
        } else if (!this.streamPartManager.isBehindProxy(streamPartId)) {
            const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, non-proxy stream already exists`
            logger.warn(reason)
            throw reason
        } else if (this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)) {
            const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, proxy stream connection already exists`
            logger.warn(reason)
            throw reason
        } else if (this.hasConnection(targetNodeId, streamPartId)) {
            const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, a connection already exists`
            logger.warn(reason)
            throw reason
        }
        logger.info(`Open proxy connection to ${targetNodeId} on ${streamPartId}`)
        if (!this.connections.has(streamPartId)) {
            this.connections.set(streamPartId, new Map())
        }
        this.connections.get(streamPartId)!.set(targetNodeId, direction)
        try {
            await this.connectAndHandshake(streamPartId, targetNodeId, direction, userId)
        } catch (err) {
            logger.warn(`Failed to create a proxy ${direction} stream connection to ${targetNodeId} for stream ${streamPartId}:\n${err}`)
            this.removeConnection(streamPartId, targetNodeId)
            this.emit(Event.CONNECTION_REJECTED, targetNodeId, streamPartId, direction, err)
        } finally {
            this.trackerManager.removeSignallingOnlySession(streamPartId, targetNodeId)
        }
    }

    private async connectAndHandshake(streamPartId: StreamPartID, targetNodeId: NodeId, direction: ProxyDirection, userId: string): Promise<void> {
        await this.trackerManager.addSignallingOnlySession(streamPartId, targetNodeId)
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        await withTimeout(this.nodeToNode.connectToNode(targetNodeId, trackerId, false), this.nodeConnectTimeout)
        await this.nodeToNode.requestProxyConnection(targetNodeId, streamPartId, direction, userId)
    }

    private async closeRandomConnections(streamPartId: StreamPartID, connectionCount: number): Promise<void> {
        logger.debug(`Close ${connectionCount} random connections on ${streamPartId}`)
        const proxiesToDisconnect = sampleSize(Array.from(this.getConnections(streamPartId).keys()), connectionCount)
        await Promise.allSettled(proxiesToDisconnect.map((node) => this.closeConnection(streamPartId, node)))
    }

    private async closeConnection(streamPartId: StreamPartID, targetNodeId: NodeId): Promise<void> {
        if (this.getConnections(streamPartId).has(targetNodeId)
            && this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)
        ) {
            logger.info(`Close proxy connection to ${targetNodeId} on ${streamPartId}`)
            await this.nodeToNode.leaveStreamOnNode(targetNodeId, streamPartId)
            this.node.emit(NodeEvent.ONE_WAY_CONNECTION_CLOSED, targetNodeId, streamPartId)
            this.removeConnection(streamPartId, targetNodeId)
        }
    }

    private getConnections(streamPartId: StreamPartID): Map<NodeId, ProxyDirection> {
        return this.connections.get(streamPartId) ?? new Map()
    }

    private hasConnection(nodeId: NodeId, streamPartId: StreamPartID): boolean {
        return this.getConnections(streamPartId).has(nodeId)
    }

    private removeConnection(streamPartId: StreamPartID, nodeId: NodeId): void {
        if (this.hasConnection(nodeId, streamPartId)) {
            this.connections.get(streamPartId)!.delete(nodeId)
        }
        this.streamPartManager.removeNodeFromStreamPart(streamPartId, nodeId)
    }

    private processHandshakeResponse(message: ProxyConnectionResponse, nodeId: NodeId): void {
        const streamPartId = message.getStreamPartID()
        if (message.accepted) {
            if (message.direction === ProxyDirection.PUBLISH) {
                this.streamPartManager.addOutOnlyNeighbor(streamPartId, nodeId)
                this.propagation.onNeighborJoined(nodeId, streamPartId)
            } else {
                this.streamPartManager.addInOnlyNeighbor(streamPartId, nodeId)
            }
            this.emit(Event.CONNECTION_ACCEPTED, nodeId, streamPartId, message.direction)
        } else {
            this.removeConnection(streamPartId, nodeId)
            this.emit(
                Event.CONNECTION_REJECTED,
                nodeId,
                streamPartId,
                message.direction,
                `Target node ${nodeId} rejected proxy ${message.direction} stream connection ${streamPartId}`
            )
        }
    }

    async onNodeDisconnected(streamPartId: StreamPartID, nodeId: NodeId): Promise<void> {
        this.removeConnection(streamPartId, nodeId)
        await retry(() => this.updateConnections(streamPartId), 'Updating proxy connections', this.abortController.signal)
    }

    isProxiedStreamPart(streamPartId: StreamPartID, direction: ProxyDirection): boolean {
        if (this.definitions.has(streamPartId)) {
            return this.definitions.get(streamPartId)!.direction === direction
        }
        return false
    }

    stop(): void {
        this.definitions.clear()
        this.abortController.abort()
    }
}
