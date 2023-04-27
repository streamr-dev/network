import { EventEmitter } from 'events'
import {
    GroupKeyRequest,
    GroupKeyResponse,
    ProxyDirection,
    StreamMessage,
    StreamMessageType,
    StreamPartID
} from '@streamr/protocol'
import { Event as NodeToNodeEvent, NodeToNode } from '../protocol/NodeToNode'
import { NodeToTracker } from '../protocol/NodeToTracker'
import { Metric, MetricsContext, MetricsDefinition, RateMetric } from '@streamr/utils'
import { StreamPartManager } from './StreamPartManager'
import { GapMisMatchError, InvalidNumberingError } from './DuplicateMessageDetector'
import { Logger, withTimeout } from "@streamr/utils"
import { PeerInfo } from '../connection/PeerInfo'
import type { NodeId, TrackerId } from '../identifiers'
import { DEFAULT_MAX_NEIGHBOR_COUNT } from '../constants'
import { TrackerManager, TrackerManagerOptions } from './TrackerManager'
import { Propagation } from './propagation/Propagation'
import { DisconnectionManager } from './DisconnectionManager'
import { ProxyStreamConnectionClient } from './proxy/ProxyStreamConnectionClient'
import { ProxyStreamConnectionServer } from './proxy/ProxyStreamConnectionServer'

const logger = new Logger(module)

export enum Event {
    NODE_CONNECTED = 'streamr:node:node-connected',
    NODE_DISCONNECTED = 'streamr:node:node-disconnected',
    MESSAGE_RECEIVED = 'streamr:node:message-received',
    UNSEEN_MESSAGE_RECEIVED = 'streamr:node:unseen-message-received',
    DUPLICATE_MESSAGE_RECEIVED = 'streamr:node:duplicate-message-received',
    NODE_SUBSCRIBED = 'streamr:node:subscribed-successfully',
    NODE_UNSUBSCRIBED = 'streamr:node:node-unsubscribed',
    ONE_WAY_CONNECTION_CLOSED = 'stream:node-one-way-connection-closed',
    JOIN_COMPLETED = 'stream:node-stream-join-operation-completed',
    JOIN_FAILED = 'stream:node-stream-join-operation-failed'
}

export interface NodeOptions extends TrackerManagerOptions {
    protocols: {
        nodeToNode: NodeToNode
        nodeToTracker: NodeToTracker
    }
    peerInfo: PeerInfo
    metricsContext?: MetricsContext
    bufferTimeoutInMs?: number
    bufferMaxSize?: number
    disconnectionWaitTime: number
    nodeConnectTimeout?: number
    acceptProxyConnections: boolean
}

interface Metrics extends MetricsDefinition {
    publishMessagesPerSecond: Metric
    publishBytesPerSecond: Metric
}

export interface Node {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: NodeId) => void): this
    on<T>(event: Event.MESSAGE_RECEIVED, listener: (msg: StreamMessage<T>, nodeId: NodeId | null) => void): this
    on<T>(event: Event.UNSEEN_MESSAGE_RECEIVED, listener: (msg: StreamMessage<T>, nodeId: NodeId | null) => void): this
    on<T>(event: Event.DUPLICATE_MESSAGE_RECEIVED, listener: (msg: StreamMessage<T>, nodeId: NodeId | null) => void): this
    on(event: Event.NODE_SUBSCRIBED, listener: (nodeId: NodeId, streamPartId: StreamPartID) => void): this
    on(event: Event.NODE_UNSUBSCRIBED, listener: (nodeId: NodeId, streamPartId: StreamPartID) => void): this
    on(event: Event.ONE_WAY_CONNECTION_CLOSED, listener: (nodeId: NodeId, streamPartId: StreamPartID) => void): this
    on(event: Event.JOIN_COMPLETED, listener: (streamPartId: StreamPartID, numOfNeighbors: number) => void): this
    on(event: Event.JOIN_FAILED, listener: (streamPartId: StreamPartID, error: string) => void): this
}

export class Node extends EventEmitter {
    public readonly peerInfo: PeerInfo
    protected readonly nodeToNode: NodeToNode
    private readonly nodeConnectTimeout: number
    private readonly started: string

    protected readonly streamPartManager: StreamPartManager
    private readonly disconnectionManager: DisconnectionManager
    private readonly propagation: Propagation
    private readonly trackerManager: TrackerManager
    private readonly consecutiveDeliveryFailures: Record<NodeId, number> // id => counter
    private readonly metricsContext: MetricsContext
    private readonly metrics: Metrics
    protected extraMetadata: Record<string, unknown> = {}
    protected readonly acceptProxyConnections: boolean
    private readonly proxyStreamConnectionClient: ProxyStreamConnectionClient
    private readonly proxyStreamConnectionServer: ProxyStreamConnectionServer

    constructor(opts: NodeOptions) {
        super()

        this.nodeToNode = opts.protocols.nodeToNode
        this.peerInfo = opts.peerInfo
        this.nodeConnectTimeout = opts.nodeConnectTimeout || 15000
        this.consecutiveDeliveryFailures = {}
        this.started = new Date().toISOString()
        this.acceptProxyConnections = opts.acceptProxyConnections

        this.metricsContext = opts.metricsContext || new MetricsContext()
        this.metrics = {
            publishMessagesPerSecond: new RateMetric(),
            publishBytesPerSecond: new RateMetric(),
        }
        this.metricsContext.addMetrics('node', this.metrics)

        this.streamPartManager = new StreamPartManager()
        this.disconnectionManager = new DisconnectionManager({
            getAllNodes: this.nodeToNode.getAllConnectionNodeIds,
            hasSharedStreamParts: this.streamPartManager.isNodePresent.bind(this.streamPartManager),
            disconnect: this.nodeToNode.disconnectFromNode.bind(this.nodeToNode),
            disconnectionDelayInMs: opts.disconnectionWaitTime,
            cleanUpIntervalInMs: 2 * 60 * 1000
        })
        this.propagation = new Propagation({
            sendToNeighbor: async (neighborId: NodeId, streamMessage: StreamMessage) => {
                try {
                    await this.nodeToNode.sendData(neighborId, streamMessage)
                    this.consecutiveDeliveryFailures[neighborId] = 0
                } catch (err) {
                    const serializedMsgId = streamMessage.getMessageID().serialize()
                    logger.warn('Failed to propagate message to neighbor', {
                        messageId: serializedMsgId,
                        consecutiveFails: this.consecutiveDeliveryFailures[neighborId] || 0,
                        neighbor: neighborId,
                        reason: err
                    })

                    // TODO: this is hack to get around the issue where `StreamStateManager` believes that we are
                    //  connected to a neighbor whilst `WebRtcEndpoint` knows that we are not. In this situation, the
                    //  Node will continuously attempt to propagate messages to the neighbor but will not actually ever
                    //  (re-)attempt a connection unless as a side-effect of something else (e.g. subscribing to another
                    //  stream, and the neighbor in question happens to get assigned to us via the other stream.)
                    //
                    // This hack basically counts consecutive delivery failures, and upon hitting 100 such failures,
                    // decides to forcefully disconnect the neighbor.
                    //
                    // Ideally this hack would not be needed, but alas, it seems like with the current event-system,
                    // we don't end up with an up-to-date state in the logic layer. I believe something like the
                    // ConnectionManager-model could help us solve the issue for good.
                    if (this.consecutiveDeliveryFailures[neighborId] === undefined) {
                        this.consecutiveDeliveryFailures[neighborId] = 0
                    }
                    this.consecutiveDeliveryFailures[neighborId] += 1
                    if (this.consecutiveDeliveryFailures[neighborId] >= 100) {
                        logger.warn('Disconnect from neighbor (encountered 100 consecutive delivery failures)', {
                            neighbor: neighborId
                        })
                        this.onNodeDisconnected(neighborId) // force disconnect
                        this.consecutiveDeliveryFailures[neighborId] = 0
                    }
                    throw err
                }
            },
            minPropagationTargets: Math.floor(DEFAULT_MAX_NEIGHBOR_COUNT / 2)
        })
        this.trackerManager = new TrackerManager(
            opts.protocols.nodeToTracker,
            opts,
            this.streamPartManager,
            (includeRtt) => ({
                started: this.started,
                location: this.peerInfo.location,
                extra: this.extraMetadata,
                rtts: includeRtt ? this.nodeToNode.getRtts() : null,
                version: "brubeck-1.0"
            }),
            {
                subscribeToStreamPartOnNodes: this.subscribeToStreamPartOnNodes.bind(this),
                unsubscribeFromStreamPartOnNode: this.unsubscribeFromStreamPartOnNode.bind(this),
                emitJoinCompleted: this.emitJoinCompleted.bind(this),
                emitJoinFailed: this.emitJoinFailed.bind(this)
            }
        )
        this.proxyStreamConnectionClient = new ProxyStreamConnectionClient({
            trackerManager: this.trackerManager,
            streamPartManager: this.streamPartManager,
            propagation: this.propagation,
            node: this,
            nodeToNode: this.nodeToNode,
            nodeConnectTimeout: this.nodeConnectTimeout
        })

        this.proxyStreamConnectionServer = new ProxyStreamConnectionServer({
            streamPartManager: this.streamPartManager,
            propagation: this.propagation,
            node: this,
            nodeToNode: this.nodeToNode,
            acceptProxyConnections: this.acceptProxyConnections,
        })

        this.nodeToNode.on(NodeToNodeEvent.NODE_CONNECTED, (nodeId) => this.emit(Event.NODE_CONNECTED, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.DATA_RECEIVED, (broadcastMessage, nodeId) => this.onDataReceived(broadcastMessage.streamMessage, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.NODE_DISCONNECTED, (nodeId) => this.onNodeDisconnected(nodeId))
    }

    start(): void {
        this.trackerManager.start()
    }

    subscribeToStreamIfHaveNotYet(streamPartId: StreamPartID, sendStatus = true): void {
        if (!this.streamPartManager.isSetUp(streamPartId)) {
            logger.trace('subscribeToStreamIfHaveNotYet', { streamPartId })
            this.streamPartManager.setUpStreamPart(streamPartId)
            this.trackerManager.onNewStreamPart(streamPartId) // TODO: perhaps we should react based on event from StreamManager?
            if (sendStatus) {
                this.trackerManager.sendStreamPartStatus(streamPartId)
            }
        } else if (this.streamPartManager.isSetUp(streamPartId) && this.streamPartManager.isBehindProxy(streamPartId)) {
            logger.trace('Failed to join stream as stream is set to be behind proxy', { streamPartId })
        }
    }

    unsubscribeFromStream(streamPartId: StreamPartID, sendStatus = true): void {
        logger.trace('unsubscribeFromStream', { streamPartId })
        this.streamPartManager.removeStreamPart(streamPartId)
        this.trackerManager.onUnsubscribeFromStreamPart(streamPartId)
        if (sendStatus) {
            this.trackerManager.sendStreamPartStatus(streamPartId)
        }
    }

    subscribeToStreamPartOnNodes(
        nodeIds: NodeId[],
        streamPartId: StreamPartID,
        trackerId: TrackerId,
        reattempt: boolean
    ): Promise<PromiseSettledResult<NodeId>[]> {
        const subscribePromises = nodeIds.map(async (nodeId) => {
            await withTimeout(this.nodeToNode.connectToNode(nodeId, trackerId, !reattempt), this.nodeConnectTimeout)
            this.disconnectionManager.cancelScheduledDisconnection(nodeId)
            this.subscribeToStreamPartOnNode(nodeId, streamPartId, false)
            return nodeId
        })
        return Promise.allSettled(subscribePromises)
    }

    async doSetProxies(
        streamPartId: StreamPartID,
        contactNodeIds: NodeId[],
        direction: ProxyDirection,
        getUserId: () => Promise<string>,
        connectionCount?: number
    ): Promise<void> {
        await this.proxyStreamConnectionClient.setProxies(streamPartId, contactNodeIds, direction, getUserId, connectionCount)
    }

    // Null source is used when a message is published by the node itself
    onDataReceived(streamMessage: StreamMessage, source: NodeId | null = null): void | never {
        const streamPartId = streamMessage.getStreamPartID()

        if (!this.streamPartManager.isSetUp(streamPartId)) {
            return
        // Check if the stream is set as one-directional and has inbound connection if message is content typed
        } else if (source
            && this.streamPartManager.isSetUp(streamPartId)
            && this.streamPartManager.isBehindProxy(streamPartId)
            && streamMessage.messageType === StreamMessageType.MESSAGE
            && !this.streamPartManager.hasInboundConnection(streamPartId, source)) {
            logger.warn('Received unexpected message on outbound proxy stream', {
                source,
                streamPartId
            })
            return
        }

        this.emit(Event.MESSAGE_RECEIVED, streamMessage, source)

        // Check duplicate
        let isUnseen
        try {
            isUnseen = this.streamPartManager.markNumbersAndCheckThatIsNotDuplicate(
                streamMessage.messageId,
                streamMessage.prevMsgRef
            )
        } catch (err) {
            if (err instanceof InvalidNumberingError) {
                logger.trace('Received message with invalid numbering', {
                    source,
                    messageId: streamMessage.messageId
                })
                return
            }
            if (err instanceof GapMisMatchError) {
                logger.warn('Received data with gap mismatch', {
                    source,
                    messageId: streamMessage.messageId,
                    err
                })
                return
            }
            throw err
        }

        if (isUnseen) {
            logger.trace('Received message', {
                source,
                messageId: streamMessage.messageId
            })
            const propagationTargets = this.getPropagationTargets(streamMessage)
            this.emit(Event.UNSEEN_MESSAGE_RECEIVED, streamMessage, source)
            this.propagation.feedUnseenMessage(streamMessage, propagationTargets, source)
            if (source === null) {
                this.metrics.publishMessagesPerSecond.record(1)
                this.metrics.publishBytesPerSecond.record(streamMessage.getSerializedContent().length)
            }
        } else {
            logger.trace('Ignored duplicate message', {
                source,
                messageId: streamMessage.messageId
            })
            this.emit(Event.DUPLICATE_MESSAGE_RECEIVED, streamMessage, source)
        }
    }

    stop(): Promise<unknown> {
        this.proxyStreamConnectionClient.stop()
        this.proxyStreamConnectionServer.stop()
        this.disconnectionManager.stop()
        this.nodeToNode.stop()
        return this.trackerManager.stop()
    }

    private getPropagationTargets(streamMessage: StreamMessage): NodeId[] {
        const streamPartId = streamMessage.getStreamPartID()
        let propagationTargets: NodeId[] = []
        propagationTargets = propagationTargets.concat([...this.streamPartManager.getOutboundNodesForStreamPart(streamPartId)])

        if (this.acceptProxyConnections) {
            if (GroupKeyRequest.is(streamMessage) || GroupKeyResponse.is(streamMessage)) {
                const { recipient } = GroupKeyRequest.fromStreamMessage(streamMessage) as GroupKeyRequest | GroupKeyResponse
                propagationTargets = propagationTargets.concat(this.proxyStreamConnectionServer.getNodeIdsForUserId(streamPartId, recipient))
            }
        } else if (
            this.streamPartManager.isBehindProxy(streamMessage.getStreamPartID())
            && this.proxyStreamConnectionClient.isProxiedStreamPart(streamMessage.getStreamPartID(), ProxyDirection.SUBSCRIBE)
        ) {
            propagationTargets = propagationTargets.concat([...this.streamPartManager.getInboundNodesForStreamPart(streamPartId)])
        }
        return propagationTargets
    }

    private subscribeToStreamPartOnNode(node: NodeId, streamPartId: StreamPartID, sendStatus = true): NodeId {
        this.streamPartManager.addNeighbor(streamPartId, node)
        this.propagation.onNeighborJoined(node, streamPartId)
        if (sendStatus) {
            this.trackerManager.sendStreamPartStatus(streamPartId)
        }
        this.emit(Event.NODE_SUBSCRIBED, node, streamPartId)
        return node
    }

    private unsubscribeFromStreamPartOnNode(node: NodeId, streamPartId: StreamPartID, sendStatus = true): void {
        this.streamPartManager.removeNodeFromStreamPart(streamPartId, node)
        logger.trace('unsubscribeFromStreamPartOnNode', { node, streamPartId })
        this.emit(Event.NODE_UNSUBSCRIBED, node, streamPartId)
        this.disconnectionManager.scheduleDisconnectionIfNoSharedStreamParts(node)
        if (sendStatus) {
            this.trackerManager.sendStreamPartStatus(streamPartId)
        }
    }

    private onNodeDisconnected(node: NodeId): void {
        const [streams, proxiedStreams] = this.streamPartManager.removeNodeFromAllStreamParts(node)
        logger.trace('Remove all subscriptions of node', { node })
        streams.forEach((s) => {
            this.trackerManager.sendStreamPartStatus(s)
        })
        proxiedStreams.forEach((s) => {
            setImmediate(async () => this.proxyStreamConnectionClient.onNodeDisconnected(s, node))
        })
        this.emit(Event.NODE_DISCONNECTED, node)
    }

    getStreamParts(): Iterable<StreamPartID> {
        return this.streamPartManager.getStreamParts()
    }

    getNeighbors(): ReadonlyArray<NodeId> {
        return this.streamPartManager.getAllNodes()
    }

    getNodeId(): NodeId {
        return this.peerInfo.peerId
    }

    getMetricsContext(): MetricsContext {
        return this.metricsContext
    }

    getDiagnosticInfo(): Record<string, unknown> {
        return {
            nodeId: this.getNodeId(),
            started: this.started,
            nodeToNode: this.nodeToNode.getDiagnosticInfo(),
            trackers: this.trackerManager.getDiagnosticInfo(),
            node: {
                streamParts: [...this.getStreamParts()],
                neighbors: this.getNeighbors(),
                assignments: this.streamPartManager.getDiagnosticInfo(),
                activePropagationTasks: this.propagation.numOfActivePropagationTasks()
            }
        }
    }

    async subscribeAndWaitForJoinOperation(streamPartId: StreamPartID, timeout = this.nodeConnectTimeout): Promise<number> {
        if (this.streamPartManager.isSetUp(streamPartId)) {
            return this.streamPartManager.getAllNodesForStreamPart(streamPartId).length
        }
        let resolveHandler: any
        let rejectHandler: any
        const res = await Promise.all([
            withTimeout(new Promise<number>((resolve, reject) => {
                resolveHandler = (stream: StreamPartID, numOfNeighbors: number) => {
                    if (stream === streamPartId) {
                        resolve(numOfNeighbors)
                    }
                }
                rejectHandler = (stream: StreamPartID, error: string) => {
                    if (stream === streamPartId) {
                        reject(new Error(error))
                    }
                }
                this.on(Event.JOIN_COMPLETED, resolveHandler)
                this.on(Event.JOIN_FAILED, rejectHandler)
            }), timeout),
            this.subscribeToStreamIfHaveNotYet(streamPartId)
        ]).finally(() => {
            this.off(Event.JOIN_COMPLETED, resolveHandler)
            this.off(Event.JOIN_FAILED, rejectHandler)
        })
        return res[0]
    }

    emitJoinCompleted(streamPartId: StreamPartID, numOfNeighbors: number): void {
        this.emit(Event.JOIN_COMPLETED, streamPartId, numOfNeighbors)
    }

    emitJoinFailed(streamPartId: StreamPartID, error: string): void {
        this.emit(Event.JOIN_FAILED, streamPartId, error)
    }

    isProxiedStreamPart(streamPartId: StreamPartID, direction: ProxyDirection): boolean {
        return this.streamPartManager.isBehindProxy(streamPartId) && this.proxyStreamConnectionClient.isProxiedStreamPart(streamPartId, direction)
    }
}
