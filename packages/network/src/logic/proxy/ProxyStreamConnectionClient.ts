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
import { Logger, withTimeout } from "@streamr/utils"
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
    RENEGOTIATING
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

export class ProxyStreamConnectionClient extends EventEmitter {
    private readonly trackerManager: TrackerManager
    private readonly streamPartManager: StreamPartManager
    private readonly nodeToNode: NodeToNode
    private readonly node: Node
    private readonly nodeConnectTimeout: number
    private readonly propagation: Propagation
    private readonly proxyTargets: Map<StreamPartID, ProxyTargets>

    constructor(opts: ProxyStreamConnectionClientOptions) {
        super()
        this.trackerManager = opts.trackerManager
        this.streamPartManager = opts.streamPartManager
        this.nodeToNode = opts.nodeToNode
        this.node = opts.node
        this.nodeConnectTimeout = opts.nodeConnectTimeout
        this.propagation = opts.propagation
        this.proxyTargets = new Map()
    }

    private addConnection(streamPartId: StreamPartID, nodeId: NodeId, direction: ProxyDirection, userId: string): void {
        this.proxyTargets.get(streamPartId)!.connections.set(nodeId, {
            state: State.NEGOTIATING,
            direction,
            userId
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

    public async addProxyConnections(
        streamPartId: StreamPartID,
        nodeIds: NodeId[],
        direction: ProxyDirection,
        userId: string,
        numOfTargets?: number
    ): Promise<void> {
        let initialAttempt = false
        if (!this.proxyTargets.has(streamPartId)) {
            initialAttempt = true
            const candidates = new Map<NodeId, ProxyCandidate>()
            nodeIds.forEach((nodeId) => candidates.set(nodeId, {
                direction,
                userId
            }))
            this.proxyTargets.set(streamPartId, {
                connections: new Map(),
                numOfTargets: numOfTargets ? numOfTargets : nodeIds.length,
                candidates
            })
        } else {
            nodeIds.forEach((id) => this.proxyTargets.get(streamPartId)!.candidates.set(id, {
                direction,
                userId
            }))
            if (numOfTargets) {
                this.proxyTargets.get(streamPartId)!.numOfTargets = numOfTargets
            }
        }
        await this.selectConnectionsFromCandidates(streamPartId, initialAttempt)

    }

    async waitForHandshake(streamPartId: StreamPartID, contactNodeId: string, direction: ProxyDirection): Promise<void> {
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

    async stopProxyingOnStream(streamPartId: StreamPartID): Promise<void> {
        if (this.proxyTargets.has(streamPartId)) {
            await this.removeProxyCandidates(streamPartId, [...this.proxyTargets.get(streamPartId)!.candidates.keys()])
        } else {
            logger.debug(`Could not stop proxying for stream ${streamPartId} as proxy connections do not exist`)
        }
    }

    async setTargetConnectionCount(streamPartId: StreamPartID, count: number): Promise<void> {
        if (this.proxyTargets.has(streamPartId)) {
            if (count > 0) {
                this.proxyTargets.get(streamPartId)!.numOfTargets = count
                await this.selectConnectionsFromCandidates(streamPartId)
            } else {
                logger.warn('Cannot set proxy connection target count below 1, if you wish to stop proxying on stream remove all candidates instead')
            }
        } else {
            logger.warn(`Could not set target count on ${streamPartId} as proxy candidates have not been set`)
        }
    }

    private hasConnection(nodeId: NodeId, streamPartId: StreamPartID): boolean {
        if (!this.proxyTargets.has(streamPartId)) {
            return false
        }
        return this.proxyTargets.get(streamPartId)!.connections.has(nodeId)
    }

    private getConnection(nodeId: NodeId, streamPartId: StreamPartID): ProxyCandidate | undefined {
        return this.proxyTargets.get(streamPartId)?.connections.get(nodeId)
    }

    public getConnectedNodeIds(streamPartId: StreamPartID): NodeId[] {
        return this.proxyTargets.has(streamPartId) ? [...this.proxyTargets.get(streamPartId)!.connections.keys()] : []
    }

    private async openProxyConnection(streamPartId: StreamPartID, targetNodeId: string, direction: ProxyDirection, userId: string): Promise<void> {
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
            this.addConnection(streamPartId, targetNodeId, direction, userId)
            await this.connectAndNegotiate(streamPartId, targetNodeId, direction, userId)
        } catch (err) {
            logger.warn(`Failed to create a proxy ${direction} stream connection to ${targetNodeId} for stream ${streamPartId}:\n${err}`)
            this.removeConnection(streamPartId, targetNodeId)
            this.emit(Event.PROXY_CONNECTION_REJECTED, targetNodeId, streamPartId, direction, err)
            return
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

    async removeProxyCandidates(streamPartId: StreamPartID, targetNodeIds: NodeId[]): Promise<void> {
        await Promise.all(targetNodeIds.map(async (targetNodeId) => {
            if (this.proxyTargets.has(streamPartId)
                && this.proxyTargets.get(streamPartId)!.candidates.has(targetNodeId)
            ) {
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
        }))
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

    async selectConnectionsFromCandidates(streamPartId: StreamPartID, initialAttempt = false): Promise<void> {
        if (!this.proxyTargets.has(streamPartId)) {
            return
        }
        const attemptCount = this.proxyTargets.get(streamPartId)!.numOfTargets - this.proxyTargets.get(streamPartId)!.connections.size
        // Add new connections
        if (attemptCount > 0) {
            const proxiesToAttempt = shuffle([...this.proxyTargets.get(streamPartId)!.candidates.entries()].filter(([id, _value]) =>
                !this.proxyTargets.get(streamPartId)!.connections.has(id)
            )).map(([id, value]) => {
                return {
                    id,
                    direction: value.direction,
                    userId: value.userId
                }
            }).splice(0, attemptCount)

            const results = await Promise.allSettled(proxiesToAttempt.map((  proxy) =>
                Promise.all([
                    this.waitForHandshake(streamPartId, proxy.id, proxy.direction),
                    this.openProxyConnection(streamPartId, proxy.id, proxy.direction, proxy.userId)
                ])
            ))
            const rejections = results.filter((res) => res.status === 'rejected').map((res) => (res as PromiseRejectedResult).reason)
            if (initialAttempt && rejections.length === results.length) {
                throw new Error(
                    `Could not open any initial ProxyConnections: ${rejections.map((rej, i) => `${rej}${i < rejections.length - 1 ? ', ' : ''}`)}`
                )
            }
        } else if (attemptCount < 0 && this.proxyTargets.get(streamPartId)!.candidates.size > 0) {
            const proxiesToDisconnect = shuffle([...this.proxyTargets.get(streamPartId)!.connections.keys()])
                .splice(0, -attemptCount)

            await Promise.allSettled(proxiesToDisconnect.map((node) => {
                this.removeConnection(streamPartId, node)
            }))
        }
    }

    stop(): void {
        this.proxyTargets.clear()
    }
}
