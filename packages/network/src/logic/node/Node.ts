import { EventEmitter } from 'events'
import { MessageLayer, SPID, StreamMessage } from 'streamr-client-protocol'
import { NodeToNode, Event as NodeToNodeEvent } from '../../protocol/NodeToNode'
import { NodeToTracker } from '../../protocol/NodeToTracker'
import { Metrics, MetricsContext } from '../../helpers/MetricsContext'
import { promiseTimeout } from '../../helpers/PromiseTools'
import { SPIDManager } from './SPIDManager'
import { GapMisMatchError, InvalidNumberingError } from './DuplicateMessageDetector'
import { Logger } from '../../helpers/Logger'
import { PeerInfo } from '../../connection/PeerInfo'
import { DEFAULT_MAX_NEIGHBOR_COUNT, TrackerId } from '../tracker/Tracker'
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
    on(event: Event.NODE_SUBSCRIBED, listener: (nodeId: NodeId, spid: SPID) => void): this
    on(event: Event.NODE_UNSUBSCRIBED, listener: (nodeId: NodeId, spid: SPID) => void): this
}

export class Node extends EventEmitter {
    /** @internal */
    public readonly peerInfo: PeerInfo
    protected readonly nodeToNode: NodeToNode
    private readonly nodeConnectTimeout: number
    private readonly started: string

    protected readonly spidManager: SPIDManager
    private readonly disconnectionManager: DisconnectionManager
    private readonly propagation: Propagation
    private readonly trackerManager: TrackerManager
    private readonly consecutiveDeliveryFailures: Record<NodeId,number> // id => counter
    private readonly metrics: Metrics
    protected extraMetadata: Record<string, unknown> = {}

    constructor(opts: NodeOptions) {
        super()

        this.nodeToNode = opts.protocols.nodeToNode
        this.peerInfo = opts.peerInfo
        this.nodeConnectTimeout = opts.nodeConnectTimeout || 15000
        this.consecutiveDeliveryFailures = {}
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

        this.spidManager = new SPIDManager()
        this.disconnectionManager = new DisconnectionManager({
            getAllNodes: this.nodeToNode.getAllConnectionNodeIds,
            hasSharedSPIDs: this.spidManager.isNodePresent.bind(this.spidManager),
            disconnect: this.nodeToNode.disconnectFromNode.bind(this.nodeToNode),
            disconnectionDelayInMs: opts.disconnectionWaitTime ?? 30 * 1000,
            cleanUpIntervalInMs: 2 * 60 * 1000
        })
        this.propagation = new Propagation({
            getNeighbors: this.spidManager.getNeighborsForSPID.bind(this.spidManager),
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
            this.spidManager,
            this.metrics,
            (includeRtt) => ({
                started: this.started,
                location: this.peerInfo.location,
                extra: this.extraMetadata,
                rtts: includeRtt ? this.nodeToNode.getRtts() : null
            }),
            {
                subscribeToSPIDIfHaveNotYet: this.subscribeToSPIDIfHaveNotYet.bind(this),
                subscribeToSPIDsOnNode: this.subscribeToSPIDsOnNode.bind(this),
                unsubscribeFromSPIDOnNode: this.unsubscribeFromSPIDOnNode.bind(this)
            }
        )

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
    }

    subscribeToSPIDIfHaveNotYet(spid: SPID, sendStatus = true): void {
        if (!this.spidManager.isSetUp(spid)) {
            logger.trace('add %s to streams', spid)
            this.spidManager.setUpSPID(spid)
            this.trackerManager.onNewStream(spid) // TODO: perhaps we should react based on event from SPIDManager?
            if (sendStatus) {
                this.trackerManager.sendStreamStatus(spid)
            }
        }
    }

    unsubscribeFromStream(spid: SPID, sendStatus = true): void {
        logger.trace('remove %s from streams', spid)
        this.spidManager.removeSPID(spid)
        this.trackerManager.onUnsubscribeFromStream(spid)
        if (sendStatus) {
            this.trackerManager.sendStreamStatus(spid)
        }
    }

    subscribeToSPIDsOnNode(
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

    onDataReceived(streamMessage: MessageLayer.StreamMessage, source: NodeId | null = null): void | never {
        this.metrics.record('onDataReceived', 1)
        const spid = new SPID(
            streamMessage.getStreamId(),
            streamMessage.getStreamPartition()
        )

        this.emit(Event.MESSAGE_RECEIVED, streamMessage, source)

        this.subscribeToSPIDIfHaveNotYet(spid)

        // Check duplicate
        let isUnseen
        try {
            isUnseen = this.spidManager.markNumbersAndCheckThatIsNotDuplicate(
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
        this.disconnectionManager.stop()
        this.nodeToNode.stop()
        return this.trackerManager.stop()
    }

    private subscribeToStreamOnNode(node: NodeId, spid: SPID, sendStatus = true): NodeId {
        this.spidManager.addNeighbor(spid, node)
        this.propagation.onNeighborJoined(node, spid)
        if (sendStatus) {
            this.trackerManager.sendStreamStatus(spid)
        }
        this.emit(Event.NODE_SUBSCRIBED, node, spid)
        return node
    }

    private unsubscribeFromSPIDOnNode(node: NodeId, spid: SPID, sendStatus = true): void {
        this.spidManager.removeNeighbor(spid, node)
        logger.trace('node %s unsubscribed from stream %s', node, spid)
        this.emit(Event.NODE_UNSUBSCRIBED, node, spid)
        this.disconnectionManager.scheduleDisconnectionIfNoSharedStreams(node)
        if (sendStatus) {
            this.trackerManager.sendStreamStatus(spid)
        }
    }

    private onNodeDisconnected(node: NodeId): void {
        this.metrics.record('onNodeDisconnect', 1)
        const streams = this.spidManager.removeNodeFromAllSPIDs(node)
        logger.trace('removed all subscriptions of node %s', node)
        streams.forEach((s) => {
            this.trackerManager.sendStreamStatus(s)
        })
        this.emit(Event.NODE_DISCONNECTED, node)
    }

    getSPIDs(): Iterable<SPID> {
        return this.spidManager.getSPIDs()
    }

    getNeighbors(): ReadonlyArray<NodeId> {
        return this.spidManager.getAllNodes()
    }

    getNodeId(): NodeId {
        return this.peerInfo.peerId
    }
}
