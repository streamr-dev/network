import { EventEmitter } from 'events'
import { MessageLayer, StreamMessage } from 'streamr-client-protocol'
import { NodeToNode, Event as NodeToNodeEvent } from '../../protocol/NodeToNode'
import { NodeToTracker } from '../../protocol/NodeToTracker'
import { StreamIdAndPartition } from '../../identifiers'
import { Metrics, MetricsContext } from '../../helpers/MetricsContext'
import { promiseTimeout } from '../../helpers/PromiseTools'
import { StreamManager } from './StreamManager'
import { GapMisMatchError, InvalidNumberingError } from './DuplicateMessageDetector'
import { Logger } from '../../helpers/Logger'
import { PeerInfo } from '../../connection/PeerInfo'
import { NameDirectory } from '../../NameDirectory'
import { DisconnectionReason } from "../../connection/ws/AbstractWsEndpoint"
import { DEFAULT_MAX_NEIGHBOR_COUNT, TrackerId } from '../tracker/Tracker'
import { TrackerManager, TrackerManagerOptions } from './TrackerManager'
import { Propagation } from './propagation/Propagation'

const logger = new Logger(module)

export type NodeId = string

export enum Event {
    NODE_CONNECTED = 'streamr:node:node-connected',
    NODE_DISCONNECTED = 'streamr:node:node-disconnected',
    MESSAGE_RECEIVED = 'streamr:node:message-received',
    UNSEEN_MESSAGE_RECEIVED = 'streamr:node:unseen-message-received',
    NODE_SUBSCRIBED = 'streamr:node:subscribed-successfully',
    NODE_UNSUBSCRIBED = 'streamr:node:node-unsubscribed'
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
    disconnectionWaitTime?: number
    nodeConnectTimeout?: number
}

export interface Node {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: NodeId) => void): this
    on<T>(event: Event.MESSAGE_RECEIVED, listener: (msg: MessageLayer.StreamMessage<T>, nodeId: NodeId) => void): this
    on<T>(event: Event.UNSEEN_MESSAGE_RECEIVED, listener: (msg: MessageLayer.StreamMessage<T>, nodeId: NodeId) => void): this
    on(event: Event.NODE_SUBSCRIBED, listener: (nodeId: NodeId, streamId: StreamIdAndPartition) => void): this
    on(event: Event.NODE_UNSUBSCRIBED, listener: (nodeId: NodeId, streamId: StreamIdAndPartition) => void): this
}

export class Node extends EventEmitter {
    /** @internal */
    public readonly peerInfo: PeerInfo
    protected readonly nodeToNode: NodeToNode
    private readonly bufferTimeoutInMs: number
    private readonly bufferMaxSize: number
    private readonly disconnectionWaitTime: number
    private readonly nodeConnectTimeout: number
    private readonly started: string

    private readonly disconnectionTimers: Record<NodeId,NodeJS.Timeout>
    protected readonly streams: StreamManager
    private readonly propagation: Propagation
    private readonly trackerManager: TrackerManager
    private readonly consecutiveDeliveryFailures: Record<NodeId,number> // id => counter
    private readonly metrics: Metrics
    private connectionCleanUpInterval: NodeJS.Timeout | null
    protected extraMetadata: Record<string, unknown> = {}

    constructor(opts: NodeOptions) {
        super()

        this.nodeToNode = opts.protocols.nodeToNode
        this.peerInfo = opts.peerInfo

        this.bufferTimeoutInMs = opts.bufferTimeoutInMs || 60 * 1000
        this.bufferMaxSize = opts.bufferMaxSize || 10000
        this.disconnectionWaitTime = opts.disconnectionWaitTime || 30 * 1000
        this.nodeConnectTimeout = opts.nodeConnectTimeout || 15000
        this.started = new Date().toLocaleString()

        const metricsContext = opts.metricsContext || new MetricsContext('')
        this.metrics = metricsContext.create('node')
            .addRecordedMetric('onDataReceived')
            .addRecordedMetric('onDataReceived:invalidNumbering')
            .addRecordedMetric('onDataReceived:gapMismatch')
            .addRecordedMetric('onDataReceived:ignoredDuplicate')
            .addRecordedMetric('propagateMessage')
            .addRecordedMetric('onSubscribeRequest')
            .addRecordedMetric('onUnsubscribeRequest')
            .addRecordedMetric('onNodeDisconnect')
            .addFixedMetric('latency')

        this.streams = new StreamManager()
        this.propagation = new Propagation({
            getNeighbors: this.streams.getNeighborsForStream.bind(this.streams),
            sendToNeighbor: async (neighborId: NodeId, streamMessage: StreamMessage) => {
                try {
                    await this.nodeToNode.sendData(neighborId, streamMessage)
                    this.consecutiveDeliveryFailures[neighborId] = 0
                } catch (e) {
                    const serializedMsgId = streamMessage.getMessageID().serialize()
                    logger.warn('failed to propagate %s (consecutiveFails=%d) to subscriber %s, reason: %s',
                        serializedMsgId,
                        this.consecutiveDeliveryFailures[neighborId] || 0,
                        neighborId,
                        e)

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
                        logger.warn(`disconnecting from ${neighborId} due to 100 consecutive delivery failures`)
                        this.onNodeDisconnected(neighborId) // force disconnect
                        this.consecutiveDeliveryFailures[neighborId] = 0
                    }
                }
            },
            minPropagationTargets: Math.floor(DEFAULT_MAX_NEIGHBOR_COUNT / 2)
        })
        this.trackerManager = new TrackerManager(
            opts.protocols.nodeToTracker,
            opts,
            this.streams,
            this.metrics,
            (includeRtt) => ({
                started: this.started,
                location: this.peerInfo.location,
                extra: this.extraMetadata,
                rtts: includeRtt ? this.nodeToNode.getRtts() : null
            }),
            {
                subscribeToStreamIfHaveNotYet: this.subscribeToStreamIfHaveNotYet.bind(this),
                subscribeToStreamsOnNode: this.subscribeToStreamsOnNode.bind(this),
                unsubscribeFromStreamOnNode: this.unsubscribeFromStreamOnNode.bind(this)
            }
        )

        this.disconnectionTimers = {}
        this.consecutiveDeliveryFailures = {}
        this.connectionCleanUpInterval = null

        this.nodeToNode.on(NodeToNodeEvent.NODE_CONNECTED, (nodeId) => this.emit(Event.NODE_CONNECTED, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.DATA_RECEIVED, (broadcastMessage, nodeId) => this.onDataReceived(broadcastMessage.streamMessage, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.NODE_DISCONNECTED, (nodeId) => this.onNodeDisconnected(nodeId))
        let avgLatency = -1

        this.on(Event.UNSEEN_MESSAGE_RECEIVED, (message) => {
            const now = new Date().getTime()
            const currentLatency = now - message.messageId.timestamp

            if (avgLatency < 0) {
                avgLatency = currentLatency
            } else {
                avgLatency = 0.8 * avgLatency + 0.2 * currentLatency
            }

            this.metrics.set('latency', avgLatency)
        })
    }

    start(): void {
        logger.trace('started')
        this.trackerManager.start()
        clearInterval(this.connectionCleanUpInterval!)
        this.connectionCleanUpInterval = this.startConnectionCleanUpInterval(2 * 60 * 1000)
    }

    subscribeToStreamIfHaveNotYet(streamId: StreamIdAndPartition, sendStatus = true): void {
        if (!this.streams.isSetUp(streamId)) {
            logger.trace('add %s to streams', streamId)
            this.streams.setUpStream(streamId)
            this.trackerManager.onNewStream(streamId) // TODO: perhaps we should react based on event from StreamManager?
            if (sendStatus) {
                this.trackerManager.sendStreamStatus(streamId)
            }
        }
    }

    unsubscribeFromStream(streamId: StreamIdAndPartition, sendStatus = true): void {
        logger.trace('remove %s from streams', streamId)
        this.streams.removeStream(streamId)
        this.trackerManager.onUnsubscribeFromStream(streamId)
        if (sendStatus) {
            this.trackerManager.sendStreamStatus(streamId)
        }
    }

    subscribeToStreamsOnNode(
        nodeIds: NodeId[],
        streamId: StreamIdAndPartition,
        trackerId: TrackerId,
        reattempt: boolean
    ): Promise<PromiseSettledResult<NodeId>[]> {
        const subscribePromises = nodeIds.map(async (nodeId) => {
            await promiseTimeout(this.nodeConnectTimeout,
                this.nodeToNode.connectToNode(nodeId, trackerId, !reattempt))

            this.clearDisconnectionTimer(nodeId)
            this.subscribeToStreamOnNode(nodeId, streamId, false)
            return nodeId
        })
        return Promise.allSettled(subscribePromises)
    }

    onDataReceived(streamMessage: MessageLayer.StreamMessage, source: NodeId | null = null): void | never {
        this.metrics.record('onDataReceived', 1)
        const streamIdAndPartition = new StreamIdAndPartition(
            streamMessage.getStreamId(),
            streamMessage.getStreamPartition()
        )

        this.emit(Event.MESSAGE_RECEIVED, streamMessage, source)

        this.subscribeToStreamIfHaveNotYet(streamIdAndPartition)

        // Check duplicate
        let isUnseen
        try {
            isUnseen = this.streams.markNumbersAndCheckThatIsNotDuplicate(
                streamMessage.messageId,
                streamMessage.prevMsgRef
            )
        } catch (e) {
            if (e instanceof InvalidNumberingError) {
                logger.trace('received from %s data %j with invalid numbering', source, streamMessage.messageId)
                this.metrics.record('onDataReceived:invalidNumber', 1)
                return
            }
            if (e instanceof GapMisMatchError) {
                logger.warn('received from %s data %j with gap mismatch detected: %j',
                    source, streamMessage.messageId, e)
                this.metrics.record('onDataReceived:gapMismatch', 1)
                return
            }
            throw e
        }

        if (isUnseen) {
            logger.trace('received from %s data %j', source, streamMessage.messageId)
            this.emit(Event.UNSEEN_MESSAGE_RECEIVED, streamMessage, source)
            this.propagation.feedUnseenMessage(streamMessage, source)
        } else {
            logger.trace('ignoring duplicate data %j (from %s)', streamMessage.messageId, source)
            this.metrics.record('onDataReceived:ignoredDuplicate', 1)
        }
    }

    stop(): Promise<unknown> {
        if (this.connectionCleanUpInterval) {
            clearInterval(this.connectionCleanUpInterval)
            this.connectionCleanUpInterval = null
        }
        Object.values(this.disconnectionTimers).forEach((timeout) => clearTimeout(timeout))
        this.nodeToNode.stop()
        return this.trackerManager.stop()
    }

    private subscribeToStreamOnNode(node: NodeId, streamId: StreamIdAndPartition, sendStatus = true): NodeId {
        this.streams.addNeighbor(streamId, node)
        this.propagation.onNeighborJoined(node, streamId)
        if (sendStatus) {
            this.trackerManager.sendStreamStatus(streamId)
        }
        this.emit(Event.NODE_SUBSCRIBED, node, streamId)
        return node
    }

    protected isNodePresent(nodeId: NodeId): boolean {
        return this.streams.isNodePresent(nodeId)
    }

    private unsubscribeFromStreamOnNode(node: NodeId, streamId: StreamIdAndPartition, sendStatus = true): void {
        this.streams.removeNodeFromStream(streamId, node)
        logger.trace('node %s unsubscribed from stream %s', node, streamId)
        this.emit(Event.NODE_UNSUBSCRIBED, node, streamId)

        if (!this.streams.isNodePresent(node)) {
            this.clearDisconnectionTimer(node)
            this.disconnectionTimers[node] = setTimeout(() => {
                delete this.disconnectionTimers[node]
                if (!this.streams.isNodePresent(node)) {
                    logger.info('No shared streams with %s, disconnecting', NameDirectory.getName(node))
                    this.nodeToNode.disconnectFromNode(node, DisconnectionReason.NO_SHARED_STREAMS)
                }
            }, this.disconnectionWaitTime)
        }
        if (sendStatus) {
            this.trackerManager.sendStreamStatus(streamId)
        }
    }

    private onNodeDisconnected(node: NodeId): void {
        this.metrics.record('onNodeDisconnect', 1)
        const streams = this.streams.removeNodeFromAllStreams(node)
        logger.trace('removed all subscriptions of node %s', node)
        streams.forEach((s) => {
            this.trackerManager.sendStreamStatus(s)
        })
        this.emit(Event.NODE_DISCONNECTED, node)
    }

    private clearDisconnectionTimer(nodeId: NodeId): void {
        if (this.disconnectionTimers[nodeId] != null) {
            clearTimeout(this.disconnectionTimers[nodeId])
            delete this.disconnectionTimers[nodeId]
        }
    }

    private startConnectionCleanUpInterval(interval: number): NodeJS.Timeout {
        return setInterval(() => {
            const peerIds = this.nodeToNode.getAllConnectionNodeIds()
            const unusedConnections = peerIds.filter((peer) => !this.isNodePresent(peer))
            if (unusedConnections.length > 0) {
                logger.debug(`Disconnecting from ${unusedConnections.length} unused connections`)
                unusedConnections.forEach((peerId) => {
                    this.nodeToNode.disconnectFromNode(peerId, 'Unused connection')
                })
            }
        }, interval)
    }

    getStreams(): ReadonlyArray<string> {
        return this.streams.getStreamsAsKeys()
    }

    getNeighbors(): ReadonlyArray<NodeId> {
        return this.streams.getAllNodes()
    }

    getNodeId(): NodeId {
        return this.peerInfo.peerId
    }
}
