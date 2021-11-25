import { EventEmitter } from 'events'
import {
    MessageLayer,
    PublishStreamConnectionRequest,
    PublishStreamConnectionResponse,
    SPID,
    StreamMessage, UnsubscribeRequest
} from 'streamr-client-protocol'
import { NodeToNode, Event as NodeToNodeEvent } from '../../protocol/NodeToNode'
import { NodeToTracker } from '../../protocol/NodeToTracker'
import { Metrics, MetricsContext } from '../../helpers/MetricsContext'
import { promiseTimeout } from '../../helpers/PromiseTools'
import { StreamManager } from './StreamManager'
import { GapMisMatchError, InvalidNumberingError } from './DuplicateMessageDetector'
import { Logger } from '../../helpers/Logger'
import { PeerInfo } from '../../connection/PeerInfo'
import { DEFAULT_MAX_NEIGHBOR_COUNT } from '../tracker/config'
import type { TrackerId } from '../tracker/Tracker'
import { TrackerManager, TrackerManagerOptions } from './TrackerManager'
import { Propagation } from './propagation/Propagation'
import { DisconnectionManager } from './DisconnectionManager'

const logger = new Logger(module)

export type NodeId = string

export enum Event {
    NODE_CONNECTED = 'streamr:node:node-connected',
    NODE_DISCONNECTED = 'streamr:node:node-disconnected',
    MESSAGE_RECEIVED = 'streamr:node:message-received',
    UNSEEN_MESSAGE_RECEIVED = 'streamr:node:unseen-message-received',
    NODE_SUBSCRIBED = 'streamr:node:subscribed-successfully',
    NODE_UNSUBSCRIBED = 'streamr:node:node-unsubscribed',
    PUBLISH_STREAM_ACCEPTED = 'streamr:node:publish-stream-accepted',
    PUBLISH_STREAM_REJECTED = 'streamr:node:node-stream-rejected',
    ONE_WAY_CONNECTION_CLOSED = 'stream:node-one-way-connection-closed'
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
    acceptOneWayConnections?: boolean
}

export interface Node {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: NodeId) => void): this
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: NodeId) => void): this
    on<T>(event: Event.MESSAGE_RECEIVED, listener: (msg: MessageLayer.StreamMessage<T>, nodeId: NodeId) => void): this
    on<T>(event: Event.UNSEEN_MESSAGE_RECEIVED, listener: (msg: MessageLayer.StreamMessage<T>, nodeId: NodeId) => void): this
    on(event: Event.NODE_SUBSCRIBED, listener: (nodeId: NodeId, spid: SPID) => void): this
    on(event: Event.NODE_UNSUBSCRIBED, listener: (nodeId: NodeId, spid: SPID) => void): this
    on(event: Event.PUBLISH_STREAM_ACCEPTED, listener: (nodeId: NodeId, spid: SPID) => void): this
    on(event: Event.PUBLISH_STREAM_REJECTED, listener: (nodeId: NodeId, spid: SPID, reason?: string) => void): this
    on(event: Event.ONE_WAY_CONNECTION_CLOSED, listener: (nodeId: NodeId, spid: SPID) => void): this
}

export class Node extends EventEmitter {
    /** @internal */
    public readonly peerInfo: PeerInfo
    protected readonly nodeToNode: NodeToNode
    private readonly nodeConnectTimeout: number
    private readonly started: string

    protected readonly streams: StreamManager
    private readonly disconnectionManager: DisconnectionManager
    private readonly propagation: Propagation
    private readonly trackerManager: TrackerManager
    private readonly consecutiveDeliveryFailures: Record<NodeId,number> // id => counter
    private readonly metrics: Metrics
    protected extraMetadata: Record<string, unknown> = {}
    private readonly acceptOneWayConnections: boolean
    private readonly attemptedPublishOnlyStreamConnections: Record<string, Record<NodeId, NodeJS.Timeout>>

    constructor(opts: NodeOptions) {
        super()

        this.nodeToNode = opts.protocols.nodeToNode
        this.peerInfo = opts.peerInfo
        this.nodeConnectTimeout = opts.nodeConnectTimeout || 15000
        this.consecutiveDeliveryFailures = {}
        this.started = new Date().toLocaleString()
        this.acceptOneWayConnections = opts.acceptOneWayConnections || false

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
        this.disconnectionManager = new DisconnectionManager({
            getAllNodes: this.nodeToNode.getAllConnectionNodeIds,
            hasSharedStreams: this.streams.isNodePresent.bind(this.streams),
            disconnect: this.nodeToNode.disconnectFromNode.bind(this.nodeToNode),
            disconnectionDelayInMs: opts.disconnectionWaitTime ?? 30 * 1000,
            cleanUpIntervalInMs: 2 * 60 * 1000
        })
        this.propagation = new Propagation({
            getNeighbors: this.streams.getOutboundNodesForStream.bind(this.streams),
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
        this.attemptedPublishOnlyStreamConnections = {}

        this.nodeToNode.on(NodeToNodeEvent.NODE_CONNECTED, (nodeId) => this.emit(Event.NODE_CONNECTED, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.DATA_RECEIVED, (broadcastMessage, nodeId) => this.onDataReceived(broadcastMessage.streamMessage, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.NODE_DISCONNECTED, (nodeId) => this.onNodeDisconnected(nodeId))
        this.nodeToNode.on(NodeToNodeEvent.PUBLISH_STREAM_REQUEST_RECEIVED, (message,  nodeId) => this.processPublishStreamRequest(message, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.PUBLISH_STREAM_RESPONSE_RECEIVED, (message, nodeId) => this.processPublishStreamResponse(message, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.LEAVE_REQUEST_RECEIVED, (message, nodeId) => this.processLeaveRequest(message, nodeId))
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
    }

    subscribeToStreamIfHaveNotYet(spid: SPID, sendStatus = true): void {
        if (!this.streams.isSetUp(spid)) {
            logger.trace('add %s to streams', spid)
            this.streams.setUpStream(spid)
            this.trackerManager.onNewStream(spid) // TODO: perhaps we should react based on event from StreamManager?
            if (sendStatus) {
                this.trackerManager.sendStreamStatus(spid)
            }
        } else if (this.streams.isSetUp(spid) && this.streams.isOneDirectional(spid)) {
            logger.warn(`Could not join stream ${spid.key} as stream is set to one-directional`)
        }
    }

    unsubscribeFromStream(spid: SPID, sendStatus = true): void {
        logger.trace('remove %s from streams', spid)
        this.streams.removeStream(spid)
        this.trackerManager.onUnsubscribeFromStream(spid)
        if (sendStatus) {
            this.trackerManager.sendStreamStatus(spid)
        }
    }

    subscribeToStreamsOnNode(
        nodeIds: NodeId[],
        spid: SPID,
        trackerId: TrackerId,
        reattempt: boolean
    ): Promise<PromiseSettledResult<NodeId>[]> {
        const subscribePromises = nodeIds.map(async (nodeId) => {
            await promiseTimeout(this.nodeConnectTimeout, this.nodeToNode.connectToNode(nodeId, trackerId, !reattempt))
            this.disconnectionManager.cancelScheduledDisconnection(nodeId)
            this.subscribeToStreamOnNode(nodeId, spid, false)
            return nodeId
        })
        return Promise.allSettled(subscribePromises)
    }

    addAttemtedPublishOnlyStreamConnection(spid: SPID, nodeId: NodeId): void {
        if (!this.attemptedPublishOnlyStreamConnections[spid.key]) {
            this.attemptedPublishOnlyStreamConnections[spid.key] = {}
        }
        this.attemptedPublishOnlyStreamConnections[spid.key][nodeId] = setTimeout(() => {
            delete this.attemptedPublishOnlyStreamConnections[spid.key][nodeId]
            if (Object.keys(this.attemptedPublishOnlyStreamConnections[spid.key]).length === 0) {
                delete this.attemptedPublishOnlyStreamConnections[spid.key]
            }
        }, this.nodeConnectTimeout * 2)
    }

    clearAttemptedPublishOnlyStreamConnection(spid: SPID, nodeId: NodeId): void {
        if (this.attemptedPublishOnlyStreamConnections[spid.key] && this.attemptedPublishOnlyStreamConnections[spid.key][nodeId]) {
            clearTimeout(this.attemptedPublishOnlyStreamConnections[spid.key][nodeId])
            delete this.attemptedPublishOnlyStreamConnections[spid.key][nodeId]
            if (Object.keys(this.attemptedPublishOnlyStreamConnections[spid.key]).length === 0) {
                delete this.attemptedPublishOnlyStreamConnections[spid.key]
            }
        }
    }

    checkIfAttemptedPublishOnlyConnectionExists(spid: SPID, nodeId: NodeId): boolean {
        if (!this.attemptedPublishOnlyStreamConnections[spid.key]) {
            return false
        } else if (!this.attemptedPublishOnlyStreamConnections[spid.key][nodeId]) {
            return false
        }
        return true
    }

    async openOutgoingStreamConnection(spid: SPID, targetNodeId: string): Promise<void> {
        const trackerId = this.trackerManager.getTrackerId(spid)
        try {
            if (!this.streams.isSetUp(spid)) {
                this.streams.setUpStream(spid, true)
            } else if (this.streams.isSetUp(spid) && !this.streams.isOneDirectional(spid)) {
                const reason = `Could not open outgoing stream connection ${spid.key}, bidirectional stream already exists`
                logger.warn(reason)
                this.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, spid, reason)
                return
            } else if (this.streams.isSetUp(spid) && this.streams.hasOutOnlyConnection(spid, targetNodeId)) {
                const reason = `Could not open outgoing stream connection ${spid.key}, publish only stream connection already exists`
                logger.warn(reason)
                this.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, spid, reason)
                return
            } else if (this.streams.isSetUp(spid) && this.checkIfAttemptedPublishOnlyConnectionExists(spid, targetNodeId)) {
                const reason = `Could not open outgoing stream connection ${spid.key}, an attempted connection already exists`
                logger.warn(reason)
                return
            }
            this.addAttemtedPublishOnlyStreamConnection(spid, targetNodeId)
            await this.trackerManager.connectToTrackerForStream(spid)
            await promiseTimeout(this.nodeConnectTimeout, this.nodeToNode.connectToNode(targetNodeId, trackerId, false))
            await this.nodeToNode.requestPublishOnlyStreamConnection(targetNodeId, spid)
        } catch (err) {
            logger.warn(`Failed to create an Outgoing stream connection to ${targetNodeId} for stream ${spid.key}:\n${err}`)
            this.clearAttemptedPublishOnlyStreamConnection(spid, targetNodeId)
            this.removeOneWayStreamConnection(spid, targetNodeId)
            this.emit(Event.PUBLISH_STREAM_REJECTED, targetNodeId, spid, err)
        }
    }

    private removeOneWayStreamConnection(spid: SPID, nodeId: NodeId): void {
        this.streams.removeNodeFromStream(spid, nodeId)
        if (this.streams.isSetUp(spid)
            && this.streams.getAllNodesForStream(spid).length === 0
            && !this.attemptedPublishOnlyStreamConnections[spid.key]
        ) {
            this.streams.removeStream(spid)
        }
    }

    async closeOutgoingStreamConnection(spid: SPID, targetNodeId: NodeId): Promise<void> {
        if (this.streams.isSetUp(spid) && this.streams.hasOutOnlyConnection(spid, targetNodeId)) {
            await this.nodeToNode.leaveStreamOnNode(targetNodeId, spid)
            this.removeOneWayStreamConnection(spid, targetNodeId)
            this.emit(Event.ONE_WAY_CONNECTION_CLOSED, targetNodeId, spid)
        } else {
            logger.warn(`An outgoing stream connection for ${spid.key} on node ${targetNodeId} does not exist`)
        }
    }

    processLeaveRequest(message: UnsubscribeRequest, nodeId: NodeId): void {
        const { streamId, streamPartition } = message
        const spid = new SPID(streamId, streamPartition)
        if (this.streams.isSetUp(spid) && this.streams.hasInOnlyConnection(spid, nodeId)) {
            this.removeOneWayStreamConnection(spid, nodeId)
            this.emit(Event.ONE_WAY_CONNECTION_CLOSED, nodeId, spid)
        }
    }

    async processPublishStreamRequest(message: PublishStreamConnectionRequest, nodeId: string): Promise<void> {
        const { streamId, streamPartition } = message
        const spid = new SPID(streamId, streamPartition)

        // More conditions could be added here, ie. a list of acceptable ids or max limit for number of one-way streams
        const isAccepted = this.streams.isSetUp(spid) && this.acceptOneWayConnections
        if (isAccepted) {
            this.streams.addInOnlyNeighbor(spid, nodeId)
        }
        return await this.nodeToNode.respondToPublishOnlyStreamConnectionRequest(nodeId, spid, isAccepted)
    }

    processPublishStreamResponse(message: PublishStreamConnectionResponse, nodeId: string): void {
        const { streamId, streamPartition, accepted } = message
        const spid = new SPID(streamId, streamPartition)
        this.clearAttemptedPublishOnlyStreamConnection(spid, nodeId)
        if (accepted) {
            this.streams.addOutOnlyNeighbor(spid, nodeId)
            this.emit(Event.PUBLISH_STREAM_ACCEPTED, nodeId, spid)
        } else {
            if (this.streams.isSetUp(spid) && this.streams.isOneDirectional(spid) && !this.attemptedPublishOnlyStreamConnections[spid.key]) {
                this.streams.removeStream(spid)
            }
            this.emit(Event.PUBLISH_STREAM_REJECTED, nodeId, spid, `Target node ${nodeId} rejected publish only stream connection ${spid.key}`)
        }
    }

    // Null source is used when a message is published by the node itself
    onDataReceived(streamMessage: MessageLayer.StreamMessage, source: NodeId | null = null): void | never {
        this.metrics.record('onDataReceived', 1)
        const spid = new SPID(
            streamMessage.getStreamId(),
            streamMessage.getStreamPartition()
        )
        // Check that node has an inbound connection, if not the node will ignore the message
        if (source && !this.streams.hasInboundConnection(spid, source)) {
            // Perhaps the node should be disconnected here if bad behaviour is repeated
            return
        }

        this.emit(Event.MESSAGE_RECEIVED, streamMessage, source)
        this.subscribeToStreamIfHaveNotYet(spid)

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
        Object.keys(this.attemptedPublishOnlyStreamConnections).forEach((stream) => {
            Object.values(this.attemptedPublishOnlyStreamConnections[stream]).forEach((timeout) => {
                clearTimeout(timeout)
            })
            delete this.attemptedPublishOnlyStreamConnections[stream]
        })
        this.disconnectionManager.stop()
        this.nodeToNode.stop()
        return this.trackerManager.stop()
    }

    private subscribeToStreamOnNode(node: NodeId, spid: SPID, sendStatus = true): NodeId {
        this.streams.addNeighbor(spid, node)
        this.propagation.onNeighborJoined(node, spid)
        if (sendStatus) {
            this.trackerManager.sendStreamStatus(spid)
        }
        this.emit(Event.NODE_SUBSCRIBED, node, spid)
        return node
    }

    private unsubscribeFromStreamOnNode(node: NodeId, spid: SPID, sendStatus = true): void {
        this.streams.removeNodeFromStream(spid, node)
        logger.trace('node %s unsubscribed from stream %s', node, spid)
        this.emit(Event.NODE_UNSUBSCRIBED, node, spid)
        this.disconnectionManager.scheduleDisconnectionIfNoSharedStreams(node)
        if (sendStatus) {
            this.trackerManager.sendStreamStatus(spid)
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

    getSPIDs(): Iterable<SPID> {
        return this.streams.getSPIDs()
    }

    getNeighbors(): ReadonlyArray<NodeId> {
        return this.streams.getAllNodes()
    }

    getNodeId(): NodeId {
        return this.peerInfo.peerId
    }
}
