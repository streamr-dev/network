import { EventEmitter } from 'events'
import { MessageLayer, TrackerLayer, Utils } from 'streamr-client-protocol'
import { NodeToNode, Event as NodeToNodeEvent } from '../protocol/NodeToNode'
import { TrackerNode, Event as TrackerNodeEvent } from '../protocol/TrackerNode'
import { MessageBuffer } from '../helpers/MessageBuffer'
import { SeenButNotPropagatedSet } from '../helpers/SeenButNotPropagatedSet'
import { ResendHandler, Strategy } from '../resend/ResendHandler'
import { ResendRequest, Status, StreamIdAndPartition } from '../identifiers'
import { DisconnectionReason } from '../connection/WsEndpoint'
import { proxyRequestStream } from '../resend/proxyRequestStream'
import { Metrics, MetricsContext } from '../helpers/MetricsContext'
import { promiseTimeout } from '../helpers/PromiseTools'
import { PerStreamMetrics } from './PerStreamMetrics'
import { StreamManager } from './StreamManager'
import { InstructionThrottler } from './InstructionThrottler'
import { GapMisMatchError, InvalidNumberingError } from './DuplicateMessageDetector'
import getLogger from '../helpers/logger'
import { PeerInfo } from '../connection/PeerInfo'
import { Readable } from 'stream'
import pino from 'pino'

export enum Event {
    NODE_CONNECTED = 'streamr:node:node-connected',
    NODE_DISCONNECTED = 'streamr:node:node-disconnected',
    MESSAGE_RECEIVED = 'streamr:node:message-received',
    UNSEEN_MESSAGE_RECEIVED = 'streamr:node:unseen-message-received',
    MESSAGE_PROPAGATED = 'streamr:node:message-propagated',
    MESSAGE_PROPAGATION_FAILED = 'streamr:node:message-propagation-failed',
    NODE_SUBSCRIBED = 'streamr:node:subscribed-successfully',
    NODE_UNSUBSCRIBED = 'streamr:node:node-unsubscribed',
    RESEND_REQUEST_RECEIVED = 'streamr:node:resend-request-received',
}

export interface NodeOptions {
    protocols: {
        nodeToNode: NodeToNode
        trackerNode: TrackerNode
    }
    peerInfo: PeerInfo
    trackers: Array<string>
    resendStrategies: Array<Strategy>
    metricsContext?: MetricsContext
    connectToBootstrapTrackersInterval?: number
    sendStatusToAllTrackersInterval?: number
    bufferTimeoutInMs?: number
    bufferMaxSize?: number
    disconnectionWaitTime?: number
    nodeConnectTimeout?: number
}

const MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION = 1

export interface Node {
    on(event: Event.NODE_CONNECTED, listener: (nodeId: string) => void): this
    on(event: Event.NODE_DISCONNECTED, listener: (nodeId: string) => void): this
    on(event: Event.MESSAGE_RECEIVED, listener: (msg: MessageLayer.StreamMessage, nodeId: string) => void): this
    on(event: Event.UNSEEN_MESSAGE_RECEIVED, listener: (msg: MessageLayer.StreamMessage, nodeId: string) => void): this
    on(event: Event.MESSAGE_PROPAGATED, listener: (msg: MessageLayer.StreamMessage) => void): this
    on(event: Event.MESSAGE_PROPAGATION_FAILED, listener: (msg: MessageLayer.StreamMessage, nodeId: string, error: Error) => void): this
    on(event: Event.NODE_SUBSCRIBED, listener: (nodeId: string, streamId: StreamIdAndPartition) => void): this
    on(event: Event.NODE_UNSUBSCRIBED, listener: (nodeId: string, streamId: StreamIdAndPartition) => void): this
    on(event: Event.RESEND_REQUEST_RECEIVED, listener: (request: ResendRequest, source: string | null) => void): this
}

export class Node extends EventEmitter {
    private readonly nodeToNode: NodeToNode
    private readonly trackerNode: TrackerNode
    private readonly peerInfo: PeerInfo
    private readonly connectToBootstrapTrackersInterval: number
    private readonly sendStatusToAllTrackersInterval: number
    private readonly bufferTimeoutInMs: number
    private readonly bufferMaxSize: number
    private readonly disconnectionWaitTime: number
    private readonly nodeConnectTimeout: number
    private readonly started: string

    private readonly logger: pino.Logger
    private readonly disconnectionTimers: { [key: string]: NodeJS.Timeout }
    private readonly streams: StreamManager
    private readonly messageBuffer: MessageBuffer<[MessageLayer.StreamMessage, string | null]>
    private readonly seenButNotPropagatedSet: SeenButNotPropagatedSet
    private readonly resendHandler: ResendHandler
    private readonly trackerRegistry: Utils.TrackerRegistry<string>
    private readonly trackerBook: { [key: string]: string } // address => id
    private readonly instructionThrottler: InstructionThrottler
    private readonly perStreamMetrics: PerStreamMetrics
    private readonly metrics: Metrics
    private connectToBoostrapTrackersInterval?: NodeJS.Timeout | null
    private handleBufferedMessagesTimeoutRef?: NodeJS.Timeout | null

    constructor(opts: NodeOptions) {
        super()

        if (!(opts.protocols.trackerNode instanceof TrackerNode) || !(opts.protocols.nodeToNode instanceof NodeToNode)) {
            throw new Error('Provided protocols are not correct')
        }
        if (!opts.trackers) {
            throw new Error('No trackers given')
        }

        this.nodeToNode = opts.protocols.nodeToNode
        this.trackerNode = opts.protocols.trackerNode
        this.peerInfo = opts.peerInfo

        this.connectToBootstrapTrackersInterval = opts.connectToBootstrapTrackersInterval || 5000
        this.sendStatusToAllTrackersInterval = opts.sendStatusToAllTrackersInterval || 1000
        this.bufferTimeoutInMs = opts.bufferTimeoutInMs || 60 * 1000
        this.bufferMaxSize = opts.bufferMaxSize || 10000
        this.disconnectionWaitTime = opts.disconnectionWaitTime || 30 * 1000
        this.nodeConnectTimeout = opts.nodeConnectTimeout || 2000
        this.started = new Date().toLocaleString()
        const metricsContext = opts.metricsContext || new MetricsContext('')

        this.logger = getLogger(`streamr:logic:node:${this.peerInfo.peerId}`)

        this.disconnectionTimers = {}
        this.streams = new StreamManager()
        this.messageBuffer = new MessageBuffer(this.bufferTimeoutInMs, this.bufferMaxSize, (streamId) => {
            this.logger.debug(`failed to deliver buffered messages of stream ${streamId}`)
        })
        this.seenButNotPropagatedSet = new SeenButNotPropagatedSet()
        this.resendHandler = new ResendHandler(
            opts.resendStrategies,
            this.logger.error.bind(this.logger),
            metricsContext
        )
        this.trackerRegistry = Utils.createTrackerRegistry(opts.trackers)
        this.trackerBook = {}
        this.instructionThrottler = new InstructionThrottler(this.handleTrackerInstruction.bind(this))

        this.trackerNode.on(TrackerNodeEvent.CONNECTED_TO_TRACKER, (trackerId) => this.onConnectedToTracker(trackerId))
        this.trackerNode.on(TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED, (streamMessage, trackerId) => this.onTrackerInstructionReceived(trackerId, streamMessage))  // eslint-disable-line max-len
        this.trackerNode.on(TrackerNodeEvent.TRACKER_DISCONNECTED, (trackerId) => this.onTrackerDisconnected(trackerId))
        this.nodeToNode.on(NodeToNodeEvent.NODE_CONNECTED, (nodeId) => this.emit(Event.NODE_CONNECTED, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.DATA_RECEIVED, (broadcastMessage, nodeId) => this.onDataReceived(broadcastMessage.streamMessage, nodeId))
        this.nodeToNode.on(NodeToNodeEvent.NODE_DISCONNECTED, (nodeId) => this.onNodeDisconnected(nodeId))
        this.nodeToNode.on(NodeToNodeEvent.RESEND_REQUEST, (request, source) => this.requestResend(request, source))
        this.on(Event.NODE_SUBSCRIBED, (nodeId, streamId) => {
            // timeout needed to get around bug in WebRTC library
            this.handleBufferedMessagesTimeoutRef = setTimeout(() => this.handleBufferedMessages(streamId), 20)
            this.sendStreamStatus(streamId)
        })
        this.nodeToNode.on(NodeToNodeEvent.LOW_BACK_PRESSURE, (nodeId) => {
            this.resendHandler.resumeResendsOfNode(nodeId)
        })

        this.nodeToNode.on(NodeToNodeEvent.HIGH_BACK_PRESSURE, (nodeId) => {
            this.resendHandler.pauseResendsOfNode(nodeId)
        })

        let avgLatency = -1

        this.on(Event.UNSEEN_MESSAGE_RECEIVED, (message) => {
            const now = new Date().getTime()
            const currentLatency = now - message.messageId.timestamp

            if (avgLatency < 0) {
                avgLatency = currentLatency
            } else {
                avgLatency = 0.8 * avgLatency + 0.2 * currentLatency
            }

            this.metrics.record('latency', avgLatency)
        })

        this.perStreamMetrics = new PerStreamMetrics()
        // .addQueriedMetric('perStream', () => this.perStreamMetrics.report()) NET-122
        this.metrics = metricsContext.create('node')
            .addQueriedMetric('messageBufferSize', () => this.messageBuffer.size())
            .addQueriedMetric('seenButNotPropagatedSetSize', () => this.seenButNotPropagatedSet.size())
            .addRecordedMetric('resendRequests')
            .addRecordedMetric('unexpectedTrackerInstructions')
            .addRecordedMetric('trackerInstructions')
            .addRecordedMetric('onDataReceived')
            .addRecordedMetric('onDataReceived:invalidNumbering')
            .addRecordedMetric('onDataReceived:gapMismatch')
            .addRecordedMetric('onDataReceived:ignoredDuplicate')
            .addRecordedMetric('propagateMessage')
            .addRecordedMetric('onSubscribeRequest')
            .addRecordedMetric('onUnsubscribeRequest')
            .addRecordedMetric('onNodeDisconnect')
            .addRecordedMetric('latency')
    }

    start(): void {
        this.logger.debug('started %s (%s)', this.peerInfo.peerId, this.peerInfo.peerName)
        this.connectToBootstrapTrackers()
        this.connectToBoostrapTrackersInterval = setInterval(
            this.connectToBootstrapTrackers.bind(this),
            this.connectToBootstrapTrackersInterval
        )
    }

    onConnectedToTracker(tracker: string): void {
        this.logger.debug('connected to tracker %s', tracker)
        this.trackerBook[this.trackerNode.resolveAddress(tracker)] = tracker
        this.sendStatus(tracker)
    }

    subscribeToStreamIfHaveNotYet(streamId: StreamIdAndPartition): void {
        if (!this.streams.isSetUp(streamId)) {
            this.logger.debug('add %s to streams', streamId)
            this.streams.setUpStream(streamId)
            this.sendStreamStatus(streamId)
        }
    }

    unsubscribeFromStream(streamId: StreamIdAndPartition): void {
        this.logger.debug('unsubscribeFromStream: remove %s from streams', streamId)
        this.streams.removeStream(streamId)
        this.instructionThrottler.removeStreamId(streamId.key())
        this.sendStreamStatus(streamId)
    }

    requestResend(request: ResendRequest, source: string | null): Readable {
        this.metrics.record('resendRequests', 1)
        this.perStreamMetrics.recordResend(request.streamId)
        this.logger.debug('received %s resend request %s with requestId %s',
            source === null ? 'local' : `from ${source}`,
            request.constructor.name,
            request.requestId)
        this.emit(Event.RESEND_REQUEST_RECEIVED, request, source)

        if (this.peerInfo.isStorage()) {
            const { streamId, streamPartition } = request
            this.subscribeToStreamIfHaveNotYet(new StreamIdAndPartition(streamId, streamPartition))
        }

        const requestStream = this.resendHandler.handleRequest(request, source)
        if (source != null) {
            proxyRequestStream(
                async (data) => {
                    try {
                        await this.nodeToNode.send(source, data)
                    } catch (e) {
                        // TODO: catch specific error
                        const requests = this.resendHandler.cancelResendsOfNode(source)
                        this.logger.warn('Failed to send resend response to %s,\n\tcancelling resends %j,\n\tError %s',
                            source, requests, e)
                    }
                },
                request,
                requestStream
            )
        }
        return requestStream
    }

    onTrackerInstructionReceived(trackerId: string, instructionMessage: TrackerLayer.InstructionMessage): void {
        this.instructionThrottler.add(instructionMessage, trackerId)
    }

    async handleTrackerInstruction(instructionMessage: TrackerLayer.InstructionMessage, trackerId: string): Promise<void> {
        const streamId = StreamIdAndPartition.fromMessage(instructionMessage)
        const { nodeIds, counter } = instructionMessage

        // Check that tracker matches expected tracker
        const expectedTrackerId = this.getTrackerId(streamId)
        if (trackerId !== expectedTrackerId) {
            this.metrics.record('unexpectedTrackerInstructions', 1)
            this.logger.warn(`Got instructions from unexpected tracker. Expected ${expectedTrackerId}, got from ${trackerId}`)
            return
        }

        this.metrics.record('trackerInstructions', 1)
        this.perStreamMetrics.recordTrackerInstruction(instructionMessage.streamId)
        this.logger.debug('received instructions for %s, nodes to connect %o', streamId, nodeIds)

        this.subscribeToStreamIfHaveNotYet(streamId)
        const currentNodes = this.streams.getAllNodesForStream(streamId)
        const nodesToUnsubscribeFrom = currentNodes.filter((nodeId) => !nodeIds.includes(nodeId))

        const subscribePromises = nodeIds.map(async (nodeId) => {
            await promiseTimeout(this.nodeConnectTimeout, this.nodeToNode.connectToNode(nodeId, trackerId))
            this.clearDisconnectionTimer(nodeId)
            this.subscribeToStreamOnNode(nodeId, streamId)
            return nodeId
        })

        nodesToUnsubscribeFrom.forEach((nodeId) => {
            this.unsubscribeFromStreamOnNode(nodeId, streamId)
        })
        const results = await Promise.allSettled(subscribePromises)
        if (this.streams.isSetUp(streamId)) {
            this.streams.updateCounter(streamId, counter)
        }

        // Log success / failures
        const subscribeNodeIds: string[] = []
        const unsubscribeNodeIds: string[] = []
        results.forEach((res) => {
            if (res.status === 'fulfilled') {
                subscribeNodeIds.push(res.value)
            } else {
                this.sendStreamStatus(streamId)
                this.logger.debug(`failed to subscribe (or connect) to node ${res.reason}`)
            }
        })

        this.logger.debug('subscribed to %j and unsubscribed from %j (streamId=%s, counter=%d)',
            subscribeNodeIds, unsubscribeNodeIds, streamId, counter)

        if (subscribeNodeIds.length !== nodeIds.length) {
            this.logger.debug('error: failed to fulfill all tracker instructions (streamId=%s, counter=%d)',
                streamId, counter)
        }
    }

    onDataReceived(streamMessage: MessageLayer.StreamMessage, source: string | null = null): void | never {
        this.metrics.record('onDataReceived', 1)
        this.perStreamMetrics.recordDataReceived(streamMessage.getStreamId())
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
                this.logger.debug('received from %s data %j with invalid numbering', source, streamMessage.messageId)
                this.metrics.record('onDataReceived:invalidNumber', 1)
                return
            }
            if (e instanceof GapMisMatchError) {
                this.logger.warn(e)
                this.logger.debug('received from %s data %j with gap mismatch detected', source, streamMessage.messageId)
                this.metrics.record('onDataReceived:gapMismatch', 1)
                return
            }
            throw e
        }

        if (isUnseen) {
            this.emit(Event.UNSEEN_MESSAGE_RECEIVED, streamMessage, source)
        }
        if (isUnseen || this.seenButNotPropagatedSet.has(streamMessage)) {
            this.logger.debug('received from %s data %j', source, streamMessage.messageId)
            this.propagateMessage(streamMessage, source)
        } else {
            this.logger.debug('ignoring duplicate data %j (from %s)', streamMessage.messageId, source)
            this.metrics.record('onDataReceived:ignoredDuplicate', 1)
            this.perStreamMetrics.recordIgnoredDuplicate(streamMessage.getStreamId())
        }
    }

    private propagateMessage(streamMessage: MessageLayer.StreamMessage, source: string | null): void {
        this.metrics.record('propagateMessage', 1)
        this.perStreamMetrics.recordPropagateMessage(streamMessage.getStreamId())
        const streamIdAndPartition = new StreamIdAndPartition(
            streamMessage.getStreamId(),
            streamMessage.getStreamPartition()
        )

        const subscribers = this.streams.getOutboundNodesForStream(streamIdAndPartition).filter((n) => n !== source)

        if (subscribers.length) {
            subscribers.forEach((subscriber) => {
                this.nodeToNode.sendData(subscriber, streamMessage).catch((e) => {
                    this.logger.error(`Failed to propagateMessage ${streamMessage} to subscriber ${subscriber}, because of ${e}`)
                    this.emit(Event.MESSAGE_PROPAGATION_FAILED, streamMessage.getMessageID(), subscriber, e)
                })
            })

            this.seenButNotPropagatedSet.delete(streamMessage)
            this.emit(Event.MESSAGE_PROPAGATED, streamMessage)
        } else {
            this.logger.debug('put %j back to buffer because could not propagate to %d nodes or more',
                streamMessage.messageId, MIN_NUM_OF_OUTBOUND_NODES_FOR_PROPAGATION)
            this.seenButNotPropagatedSet.add(streamMessage)
            this.messageBuffer.put(streamIdAndPartition.key(), [streamMessage, source])
        }
    }

    stop(): Promise<unknown> {
        this.logger.debug('stopping')
        this.resendHandler.stop()
        this.instructionThrottler.reset()

        if (this.connectToBoostrapTrackersInterval) {
            clearInterval(this.connectToBoostrapTrackersInterval)
            this.connectToBoostrapTrackersInterval = null
        }
        if (this.handleBufferedMessagesTimeoutRef) {
            clearTimeout(this.handleBufferedMessagesTimeoutRef)
            this.handleBufferedMessagesTimeoutRef = null
        }

        Object.values(this.disconnectionTimers).forEach((timeout) => clearTimeout(timeout))

        this.messageBuffer.clear()
        return Promise.all([
            this.trackerNode.stop(),
            this.nodeToNode.stop(),
        ])
    }

    private getStatus(tracker: string): Status {
        return {
            streams: this.streams.getStreamsWithConnections((streamKey) => {
                return this.getTrackerId(StreamIdAndPartition.fromKey(streamKey)) === tracker
            }),
            started: this.started,
            rtts: this.nodeToNode.getRtts(),
            location: this.peerInfo.location
        }
    }

    private sendStreamStatus(streamId: StreamIdAndPartition): void {
        const trackerId = this.getTrackerId(streamId)
        if (trackerId) {
            this.sendStatus(trackerId)
        }
    }

    private async sendStatus(tracker: string): Promise<void> {
        const status = this.getStatus(tracker)

        try {
            await this.trackerNode.sendStatus(tracker, status)
            this.logger.debug('sent status %j to tracker %s', status.streams, tracker)
        } catch (e) {
            this.logger.debug('failed to send status to tracker %s (%s)', tracker, e)
        }
    }

    private subscribeToStreamOnNode(node: string, streamId: StreamIdAndPartition): string {
        this.streams.addInboundNode(streamId, node)
        this.streams.addOutboundNode(streamId, node)
        this.emit(Event.NODE_SUBSCRIBED, node, streamId)
        return node
    }

    protected getTrackerId(streamId: StreamIdAndPartition): string | null {
        const address = this.trackerRegistry.getTracker(streamId.id, streamId.partition)
        return this.trackerBook[address] || null
    }

    protected isNodePresent(nodeId: string): boolean {
        return this.streams.isNodePresent(nodeId)
    }

    private unsubscribeFromStreamOnNode(node: string, streamId: StreamIdAndPartition): void {
        this.streams.removeNodeFromStream(streamId, node)
        this.logger.debug('node %s unsubscribed from stream %s', node, streamId)
        this.emit(Event.NODE_UNSUBSCRIBED, node, streamId)

        if (!this.streams.isNodePresent(node)) {
            this.clearDisconnectionTimer(node)
            this.disconnectionTimers[node] = setTimeout(() => {
                delete this.disconnectionTimers[node]
                if (!this.streams.isNodePresent(node)) {
                    this.logger.debug('no shared streams with node %s, disconnecting', node)
                    this.nodeToNode.disconnectFromNode(node, DisconnectionReason.NO_SHARED_STREAMS)
                }
            }, this.disconnectionWaitTime)
        }

        this.sendStreamStatus(streamId)
    }

    onNodeDisconnected(node: string): void {
        this.metrics.record('onNodeDisconnect', 1)
        this.resendHandler.cancelResendsOfNode(node)
        const streams = this.streams.removeNodeFromAllStreams(node)
        this.logger.debug('removed all subscriptions of node %s', node)
        streams.forEach((s) => this.sendStreamStatus(s))
        this.emit(Event.NODE_DISCONNECTED, node)
    }

    onTrackerDisconnected(tracker: string): void {
        this.logger.debug('disconnected from tracker %s', tracker)
    }

    private handleBufferedMessages(streamId: StreamIdAndPartition): void {
        this.messageBuffer.popAll(streamId.key())
            .forEach(([streamMessage, source]) => {
                this.onDataReceived(streamMessage, source)
            })
    }

    private connectToBootstrapTrackers(): void {
        this.trackerRegistry.getAllTrackers().forEach((address) => {
            this.trackerNode.connectToTracker(address)
                .catch((err) => {
                    this.logger.error('Could not connect to tracker %s because %j', address, err.toString())
                })
        })
    }

    private clearDisconnectionTimer(nodeId: string): void {
        if (this.disconnectionTimers[nodeId] != null) {
            clearTimeout(this.disconnectionTimers[nodeId])
            delete this.disconnectionTimers[nodeId]
        }
    }

    getStreams(): ReadonlyArray<string> {
        return this.streams.getStreamsAsKeys()
    }

    getNeighbors(): ReadonlyArray<string> {
        return this.streams.getAllNodes()
    }
}
