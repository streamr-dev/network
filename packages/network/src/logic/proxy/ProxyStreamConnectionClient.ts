import { TrackerManager } from '../TrackerManager'
import { StreamPartManager } from '../StreamPartManager'
import { NodeToNode } from '../../protocol/NodeToNode'
import { NodeId } from '../../identifiers'
import { Node, Event as NodeEvent } from '../Node'
import {
    ProxyConnectionResponse,
    ProxyDirection,
    StreamPartID,
    UnsubscribeRequest
} from '@streamr/protocol'
import { Logger, wait, withTimeout } from "@streamr/utils"
import { Propagation } from '../propagation/Propagation'
import { shuffle } from 'lodash'
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

enum State {
    NEGOTIATING,
    ACCEPTED,
}

interface ProxyCandidate {
    state?: State
    direction: ProxyDirection
    userId: string
}

interface ProxyTargets {
    candidates: Map<NodeId, ProxyCandidate>
    numOfTargets: number
    connections: Map<NodeId, ProxyCandidate>
}

export enum Event {
    PROXY_CONNECTION_ACCEPTED = 'streamr:node:proxy-connection-accepted',
    PROXY_CONNECTION_REJECTED = 'streamr:node:proxy-connection-rejected'
}

export interface ProxyStreamConnectionClient {
    on(event: Event.PROXY_CONNECTION_ACCEPTED,
       listener: (nodeId: NodeId, streamPartId: StreamPartID, direction: ProxyDirection) => void): this
    on(event: Event.PROXY_CONNECTION_REJECTED,
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
    private readonly proxyTargets: Map<StreamPartID, ProxyTargets>
    private readonly abortController: AbortController

    constructor(opts: ProxyStreamConnectionClientOptions) {
        super()
        this.trackerManager = opts.trackerManager
        this.streamPartManager = opts.streamPartManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.nodeConnectTimeout = opts.nodeConnectTimeout
        this.propagation = opts.propagation
        this.proxyTargets = new Map()
        this.abortController = new AbortController()
    }

    public async setProxies(
        streamPartId: StreamPartID,
        nodeIds: NodeId[],
        direction: ProxyDirection,
        userId: string,
        connectionCount?: number
    ): Promise<void> {
        if (!this.proxyTargets.has(streamPartId)) {
            const candidates = new Map<NodeId, ProxyCandidate>()
            nodeIds.forEach((nodeId) => candidates.set(nodeId, {
                direction,
                userId
            }))
            this.proxyTargets.set(streamPartId, {
                connections: new Map(),
                numOfTargets: connectionCount ? connectionCount : nodeIds.length,
                candidates
            })
        } else {
            const streamProxies = this.proxyTargets.get(streamPartId)!
            streamProxies.candidates.clear()
            nodeIds.forEach((id) => streamProxies!.candidates.set(id, {
                direction,
                userId
            }))

            streamProxies!.numOfTargets = connectionCount ? connectionCount : nodeIds.length
            await Promise.all(Array.from(streamProxies!.connections.entries()).map(async ([id, value]) => {
                if (!streamProxies!.candidates.has(id) || value.direction !== direction) {
                    await this.closeProxyConnection(streamPartId, id)
                }
            }))
        }

        await this.updateConnections(streamPartId)
    }

    async ensureConnections(streamPartId: StreamPartID): Promise<void> {
        await retry(() => this.updateConnections(streamPartId), 'Updating proxy connections', this.abortController.signal)
    }

    async updateConnections(streamPartId: StreamPartID): Promise<void> {
        if (!this.proxyTargets.has(streamPartId)) {
            return
        }
        const streamProxies = this.proxyTargets.get(streamPartId)!
        const connectionCountDiff = streamProxies.numOfTargets - streamProxies.connections.size
        if (connectionCountDiff > 0) {
            await this.openConnections(streamPartId, connectionCountDiff)
        } else if (connectionCountDiff < 0 && streamProxies.candidates.size > 0) {
            await this.closeConnections(streamPartId, -connectionCountDiff)
        }
    }

    private async openConnections(streamPartId: StreamPartID, connectionCount: number): Promise<void> {
        const streamProxies = this.proxyTargets.get(streamPartId)!
        const proxiesToAttempt = shuffle([...streamProxies.candidates.entries()].filter(([id, _value]) =>
            !streamProxies.connections.has(id)
        )).map(([id, value]) => {
            return {
                id,
                direction: value.direction,
                userId: value.userId
            }
        }).splice(0, connectionCount)

        await Promise.all(proxiesToAttempt.map((  proxy) =>
            this.attemptProxyConnection(streamPartId, proxy.id, proxy.direction, proxy.userId)
        ))
    }

    private async closeConnections(streamPartId: StreamPartID, connectionCount: number): Promise<void> {
        const streamProxies = this.proxyTargets.get(streamPartId)!
        const proxiesToDisconnect = shuffle([...streamProxies.connections.keys()])
            .splice(0, connectionCount)

        await Promise.allSettled(proxiesToDisconnect.map((node) => this.closeProxyConnection(streamPartId, node)))
    }

    private async closeProxyConnection(streamPartId: StreamPartID, targetNodeId: NodeId): Promise<void> {
        if (this.proxyTargets.has(streamPartId)) {
            if (this.proxyTargets.get(streamPartId)!.connections.has(targetNodeId)
                && this.streamPartManager.isSetUp(streamPartId)
                && this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)
            ) {
                await this.nodeToNode.leaveStreamOnNode(targetNodeId, streamPartId)
                this.node.emit(NodeEvent.ONE_WAY_CONNECTION_CLOSED, targetNodeId, streamPartId)
            }
            this.removeConnection(streamPartId, targetNodeId)
        } else {
            const reason = `A proxy candidate for ${streamPartId} on node ${targetNodeId} does not exist`
            logger.warn(reason)
            throw reason
        }
    }

    private async attemptProxyConnection(streamPartId: StreamPartID, nodeId: NodeId, direction: ProxyDirection, userId: string): Promise<void> {
        await Promise.all([
            this.waitForHandshake(streamPartId, nodeId, direction),
            this.initiateProxyConnection(streamPartId, nodeId, direction, userId)
        ])
    }

    private async initiateProxyConnection(
        streamPartId: StreamPartID, targetNodeId: string, direction: ProxyDirection, userId: string): Promise<void> {

        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        try {
            if (!this.streamPartManager.isSetUp(streamPartId)) {
                this.streamPartManager.setUpStreamPart(streamPartId, true)
            } else if (!this.streamPartManager.isBehindProxy(streamPartId)) {
                const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, bidirectional stream already exists`
                logger.warn(reason)
                this.emit(Event.PROXY_CONNECTION_REJECTED, targetNodeId, streamPartId, direction, reason)
                return
            } else if (this.streamPartManager.hasOnewayConnection(streamPartId, targetNodeId)) {
                const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, proxy stream connection already exists`
                logger.warn(reason)
                this.emit(Event.PROXY_CONNECTION_REJECTED, targetNodeId, streamPartId, direction, reason)
                return
            } else if (this.hasConnection(targetNodeId, streamPartId)) {
                const reason = `Could not open a proxy ${direction} stream connection ${streamPartId}, a connection already exists`
                logger.warn(reason)
                this.emit(Event.PROXY_CONNECTION_REJECTED, targetNodeId, streamPartId, direction, reason)
                return
            }
            this.proxyTargets.get(streamPartId)!.connections.set(targetNodeId, {
                state: State.NEGOTIATING,
                direction,
                userId
            })
            await this.connectAndNegotiate(streamPartId, targetNodeId, direction, userId)
        } catch (err) {
            logger.warn(`Failed to create a proxy ${direction} stream connection to ${targetNodeId} for stream ${streamPartId}:\n${err}`)
            this.removeConnection(streamPartId, targetNodeId, false)
            this.emit(Event.PROXY_CONNECTION_REJECTED, targetNodeId, streamPartId, direction, err)
            return
        } finally {
            this.trackerManager.disconnectFromSignallingOnlyTracker(trackerId)
        }
    }

    private hasConnection(nodeId: NodeId, streamPartId: StreamPartID): boolean {
        if (!this.proxyTargets.has(streamPartId)) {
            return false
        }
        return this.proxyTargets.get(streamPartId)!.connections.has(nodeId)
    }

    private async connectAndNegotiate(streamPartId: StreamPartID, targetNodeId: NodeId, direction: ProxyDirection, userId: string): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(streamPartId)
        const trackerAddress = this.trackerManager.getTrackerAddress(streamPartId)

        await this.trackerManager.connectToSignallingOnlyTracker(trackerId, trackerAddress)
        await withTimeout(this.nodeToNode.connectToNode(targetNodeId, trackerId, false), this.nodeConnectTimeout)
        await this.nodeToNode.requestProxyConnection(targetNodeId, streamPartId, direction, userId)
    }

    private async waitForHandshake(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection): Promise<void> {
        let resolveHandler: any
        let rejectHandler: any
        await Promise.all([
            new Promise<void>((resolve, reject) => {
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
                this.on(Event.PROXY_CONNECTION_ACCEPTED, resolveHandler)
                this.on(Event.PROXY_CONNECTION_REJECTED, rejectHandler)
            }),
        ]).finally(() => {
            this.off(Event.PROXY_CONNECTION_ACCEPTED, resolveHandler)
            this.off(Event.PROXY_CONNECTION_REJECTED, rejectHandler)
        })
    }

    public removeConnection(streamPartId: StreamPartID, nodeId: NodeId, removeCandidate = true): void {
        if (this.proxyTargets.has(streamPartId)) {
            this.proxyTargets.get(streamPartId)!.connections.delete(nodeId)
            if (removeCandidate) {
                this.proxyTargets.get(streamPartId)!.candidates.delete(nodeId)
                if (this.proxyTargets.get(streamPartId)!.candidates.size === 0) {
                    this.proxyTargets.delete(streamPartId)
                }
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

    private getConnection(nodeId: NodeId, streamPartId: StreamPartID): ProxyCandidate | undefined {
        return this.proxyTargets.get(streamPartId)?.connections.get(nodeId)
    }

    public getConnectedNodeIds(streamPartId: StreamPartID): NodeId[] {
        return this.proxyTargets.has(streamPartId) ? [...this.proxyTargets.get(streamPartId)!.connections.keys()] : []
    }

    processLeaveRequest(message: UnsubscribeRequest, nodeId: NodeId): void {
        const streamPartId = message.getStreamPartID()
        if (this.streamPartManager.isSetUp(streamPartId) && this.streamPartManager.hasInOnlyConnection(streamPartId, nodeId)) {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(NodeEvent.ONE_WAY_CONNECTION_CLOSED, nodeId, streamPartId)
        }
        if (this.streamPartManager.isSetUp(streamPartId) && this.streamPartManager.hasOutOnlyConnection(streamPartId, nodeId)) {
            this.removeConnection(streamPartId, nodeId)
            this.node.emit(NodeEvent.ONE_WAY_CONNECTION_CLOSED, nodeId, streamPartId)
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
            this.emit(Event.PROXY_CONNECTION_ACCEPTED, nodeId, streamPartId, message.direction)

        } else {
            this.removeConnection(streamPartId, nodeId)
            this.emit(
                Event.PROXY_CONNECTION_REJECTED,
                nodeId,
                streamPartId,
                message.direction,
                `Target node ${nodeId} rejected proxy ${message.direction} stream connection ${streamPartId}`
            )
        }
    }

    isProxiedStreamPart(streamPartId: StreamPartID, direction: ProxyDirection): boolean {
        if (this.proxyTargets.get(streamPartId) && [...this.proxyTargets.get(streamPartId)!.connections.values()].length > 0) {
            return [...this.proxyTargets.get(streamPartId)!.connections.values()][0].direction === direction
        }
        return false
    }

    stop(): void {
        this.proxyTargets.clear()
        this.abortController.abort()
    }
}
