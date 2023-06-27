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
import { Logger, wait, waitForEvent, withTimeout } from "@streamr/utils"
import { Propagation } from '../propagation/Propagation'
import sampleSize from 'lodash/sampleSize'
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
            logger.warn(`Failed ${description} (retrying after delay)`, {
                delayInMs: delay
            })
        }
        await wait(delay, abortSignal)
    }
}

export class ProxyStreamConnectionClient extends EventEmitter {
    private readonly connections: Map<StreamPartID, Map<NodeId, ProxyDirection>>
    private readonly definitions: Map<StreamPartID, ProxyDefinition>
    private readonly nodeConnectTimeout: number
    private readonly trackerManager: TrackerManager
    private readonly streamPartManager: StreamPartManager
    private readonly nodeToNode: NodeToNode
    private readonly node: Node
    private readonly propagation: Propagation
    private readonly abortController: AbortController

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
        logger.trace('setProxies', { streamPartId })
        if (connectionCount !== undefined && connectionCount > nodeIds.length) {
            throw Error('Cannot set connectionCount above the size of the configured array of nodes')
        }
        if (this.streamPartManager.isSetUp(streamPartId) && !this.streamPartManager.isBehindProxy(streamPartId)) {
            throw Error(`Could not set ${direction} proxies for stream ${streamPartId}, non-proxy stream already exists`)
        }
        if (nodeIds.length > 0 && !this.streamPartManager.isSetUp(streamPartId)) {
            this.streamPartManager.setUpStreamPart(streamPartId, true)
        }
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
        const connectionCountDiff = this.definitions.get(streamPartId)!.connectionCount - this.getConnections(streamPartId).size
        if (connectionCountDiff > 0) {
            await this.openRandomConnections(streamPartId, connectionCountDiff)
        } else if (connectionCountDiff < 0) {
            await this.closeRandomConnections(streamPartId, -connectionCountDiff)
        }
    }

    private getInvalidConnections(streamPartId: StreamPartID): string[] {
        return Array.from(this.getConnections(streamPartId).keys()).filter((id) => {
            const definition = this.definitions.get(streamPartId)
            return !definition!.nodeIds.has(id)
                || definition!.direction !== this.getConnections(streamPartId).get(id)
        })
    }

    private async openRandomConnections(streamPartId: StreamPartID, connectionCount: number): Promise<void> {
        const definition = this.definitions.get(streamPartId)!
        const proxiesToAttempt = sampleSize(Array.from(definition.nodeIds.keys()).filter((id) =>
            !this.getConnections(streamPartId).has(id)
        ), connectionCount)
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
        const predicate = (node: string, stream: StreamPartID, eventDirection: ProxyDirection) => {
            return node === contactNodeId && stream === streamPartId && direction === eventDirection
        }
        await Promise.race([
            waitForEvent(this, Event.CONNECTION_ACCEPTED, this.nodeConnectTimeout, predicate),
            (async () => {
                const result = await waitForEvent(this, Event.CONNECTION_REJECTED, this.nodeConnectTimeout, predicate)
                throw new Error(
                    `Joining stream as proxy ${direction} failed on contact-node ${contactNodeId} for stream ${streamPartId}`
                    + ` reason: ${result[3]}`
                )
            })()
        ])
    }

    private async initiateConnection(
        streamPartId: StreamPartID,
        targetNodeId: string,
        direction: ProxyDirection,
        userId: string
    ): Promise<void> {
        logger.info('Open proxy connection', {
            targetNodeId,
            streamPartId
        })
        try {
            await this.connectAndHandshake(streamPartId, targetNodeId, direction, userId)
        } catch (err) {
            logger.warn('Failed to create a proxy stream connection', {
                streamPartId,
                targetNodeId,
                direction,
                userId,
                err
            })
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
        const proxiesToDisconnect = sampleSize(Array.from(this.getConnections(streamPartId).keys()), connectionCount)
        await Promise.allSettled(proxiesToDisconnect.map((node) => this.closeConnection(streamPartId, node)))
    }

    private async closeConnection(streamPartId: StreamPartID, targetNodeId: NodeId): Promise<void> {
        if (this.getConnections(streamPartId).has(targetNodeId)
            && this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)
        ) {
            logger.info('Close proxy connection', {
                targetNodeId,
                streamPartId
            })
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

        if (this.definitions.get(streamPartId)!.nodeIds.size === 0 && this.getConnections(streamPartId).size === 0) {
            this.streamPartManager.removeStreamPart(streamPartId)
        }
    }

    private processHandshakeResponse(message: ProxyConnectionResponse, nodeId: NodeId): void {
        const streamPartId = message.getStreamPartID()
        if (message.accepted) {
            if (!this.connections.has(streamPartId)) {
                this.connections.set(streamPartId, new Map())
            }
            this.connections.get(streamPartId)!.set(nodeId, message.direction)
            if (message.direction === ProxyDirection.PUBLISH) {
                this.streamPartManager.addOutOnlyNeighbor(streamPartId, nodeId)
                this.propagation.onNeighborJoined(nodeId, streamPartId)
            } else {
                this.streamPartManager.addInOnlyNeighbor(streamPartId, nodeId)
            }
            this.emit(Event.CONNECTION_ACCEPTED, nodeId, streamPartId, message.direction)
        } else {
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
        await retry(() => this.updateConnections(streamPartId), 'updating proxy connections', this.abortController.signal)
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
