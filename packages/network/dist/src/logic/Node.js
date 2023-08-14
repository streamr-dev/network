"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Node = exports.Event = void 0;
const events_1 = require("events");
const protocol_1 = require("@streamr/protocol");
const NodeToNode_1 = require("../protocol/NodeToNode");
const utils_1 = require("@streamr/utils");
const StreamPartManager_1 = require("./StreamPartManager");
const DuplicateMessageDetector_1 = require("./DuplicateMessageDetector");
const utils_2 = require("@streamr/utils");
const constants_1 = require("../constants");
const TrackerManager_1 = require("./TrackerManager");
const Propagation_1 = require("./propagation/Propagation");
const DisconnectionManager_1 = require("./DisconnectionManager");
const ProxyStreamConnectionClient_1 = require("./proxy/ProxyStreamConnectionClient");
const ProxyStreamConnectionServer_1 = require("./proxy/ProxyStreamConnectionServer");
const logger = new utils_2.Logger(module);
var Event;
(function (Event) {
    Event["NODE_CONNECTED"] = "streamr:node:node-connected";
    Event["NODE_DISCONNECTED"] = "streamr:node:node-disconnected";
    Event["MESSAGE_RECEIVED"] = "streamr:node:message-received";
    Event["UNSEEN_MESSAGE_RECEIVED"] = "streamr:node:unseen-message-received";
    Event["DUPLICATE_MESSAGE_RECEIVED"] = "streamr:node:duplicate-message-received";
    Event["NODE_SUBSCRIBED"] = "streamr:node:subscribed-successfully";
    Event["NODE_UNSUBSCRIBED"] = "streamr:node:node-unsubscribed";
    Event["ONE_WAY_CONNECTION_CLOSED"] = "stream:node-one-way-connection-closed";
    Event["JOIN_COMPLETED"] = "stream:node-stream-join-operation-completed";
    Event["JOIN_FAILED"] = "stream:node-stream-join-operation-failed";
})(Event || (exports.Event = Event = {}));
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class Node extends events_1.EventEmitter {
    constructor(opts) {
        super();
        this.extraMetadata = {};
        this.nodeToNode = opts.protocols.nodeToNode;
        this.peerInfo = opts.peerInfo;
        this.nodeConnectTimeout = opts.nodeConnectTimeout || 15000;
        this.consecutiveDeliveryFailures = {};
        this.started = new Date().toISOString();
        this.acceptProxyConnections = opts.acceptProxyConnections;
        this.metricsContext = opts.metricsContext || new utils_1.MetricsContext();
        this.metrics = {
            publishMessagesPerSecond: new utils_1.RateMetric(),
            publishBytesPerSecond: new utils_1.RateMetric(),
        };
        this.metricsContext.addMetrics('node', this.metrics);
        this.streamPartManager = new StreamPartManager_1.StreamPartManager();
        this.disconnectionManager = new DisconnectionManager_1.DisconnectionManager({
            getAllNodes: this.nodeToNode.getAllConnectionNodeIds,
            hasSharedStreamParts: this.streamPartManager.isNodePresent.bind(this.streamPartManager),
            disconnect: this.nodeToNode.disconnectFromNode.bind(this.nodeToNode),
            disconnectionDelayInMs: opts.disconnectionWaitTime,
            cleanUpIntervalInMs: 2 * 60 * 1000
        });
        this.propagation = new Propagation_1.Propagation({
            sendToNeighbor: async (neighborId, streamMessage) => {
                try {
                    await this.nodeToNode.sendData(neighborId, streamMessage);
                    this.consecutiveDeliveryFailures[neighborId] = 0;
                }
                catch (err) {
                    const serializedMsgId = streamMessage.getMessageID().serialize();
                    logger.warn('Failed to propagate message to neighbor', {
                        messageId: serializedMsgId,
                        consecutiveFails: this.consecutiveDeliveryFailures[neighborId] || 0,
                        neighbor: neighborId,
                        reason: err
                    });
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
                        this.consecutiveDeliveryFailures[neighborId] = 0;
                    }
                    this.consecutiveDeliveryFailures[neighborId] += 1;
                    if (this.consecutiveDeliveryFailures[neighborId] >= 100) {
                        logger.warn('Disconnect from neighbor (encountered 100 consecutive delivery failures)', {
                            neighbor: neighborId
                        });
                        this.onNodeDisconnected(neighborId); // force disconnect
                        this.consecutiveDeliveryFailures[neighborId] = 0;
                    }
                    throw err;
                }
            },
            minPropagationTargets: Math.floor(constants_1.DEFAULT_MAX_NEIGHBOR_COUNT / 2)
        });
        this.trackerManager = new TrackerManager_1.TrackerManager(opts.protocols.nodeToTracker, opts, this.streamPartManager, (includeRtt) => ({
            started: this.started,
            location: this.peerInfo.location,
            extra: this.extraMetadata,
            rtts: includeRtt ? this.nodeToNode.getRtts() : null,
            version: "brubeck-1.0"
        }), {
            subscribeToStreamPartOnNodes: this.subscribeToStreamPartOnNodes.bind(this),
            unsubscribeFromStreamPartOnNode: this.unsubscribeFromStreamPartOnNode.bind(this),
            emitJoinCompleted: this.emitJoinCompleted.bind(this),
            emitJoinFailed: this.emitJoinFailed.bind(this)
        });
        this.proxyStreamConnectionClient = new ProxyStreamConnectionClient_1.ProxyStreamConnectionClient({
            trackerManager: this.trackerManager,
            streamPartManager: this.streamPartManager,
            propagation: this.propagation,
            node: this,
            nodeToNode: this.nodeToNode,
            nodeConnectTimeout: this.nodeConnectTimeout
        });
        this.proxyStreamConnectionServer = new ProxyStreamConnectionServer_1.ProxyStreamConnectionServer({
            streamPartManager: this.streamPartManager,
            propagation: this.propagation,
            node: this,
            nodeToNode: this.nodeToNode,
            acceptProxyConnections: this.acceptProxyConnections,
        });
        this.nodeToNode.on(NodeToNode_1.Event.NODE_CONNECTED, (nodeId) => this.emit(Event.NODE_CONNECTED, nodeId));
        this.nodeToNode.on(NodeToNode_1.Event.DATA_RECEIVED, (broadcastMessage, nodeId) => this.onDataReceived(broadcastMessage.streamMessage, nodeId));
        this.nodeToNode.on(NodeToNode_1.Event.NODE_DISCONNECTED, (nodeId) => this.onNodeDisconnected(nodeId));
    }
    start() {
        this.trackerManager.start();
    }
    subscribeToStreamIfHaveNotYet(streamPartId, sendStatus = true) {
        if (!this.streamPartManager.isSetUp(streamPartId)) {
            logger.trace('subscribeToStreamIfHaveNotYet', { streamPartId });
            this.streamPartManager.setUpStreamPart(streamPartId);
            this.trackerManager.onNewStreamPart(streamPartId); // TODO: perhaps we should react based on event from StreamManager?
            if (sendStatus) {
                this.trackerManager.sendStreamPartStatus(streamPartId);
            }
        }
        else if (this.streamPartManager.isSetUp(streamPartId) && this.streamPartManager.isBehindProxy(streamPartId)) {
            logger.trace('Failed to join stream as stream is set to be behind proxy', { streamPartId });
        }
    }
    unsubscribeFromStream(streamPartId, sendStatus = true) {
        logger.trace('unsubscribeFromStream', { streamPartId });
        this.streamPartManager.removeStreamPart(streamPartId);
        this.trackerManager.onUnsubscribeFromStreamPart(streamPartId);
        if (sendStatus) {
            this.trackerManager.sendStreamPartStatus(streamPartId);
        }
    }
    subscribeToStreamPartOnNodes(nodeIds, streamPartId, trackerId, reattempt) {
        const subscribePromises = nodeIds.map(async (nodeId) => {
            await (0, utils_2.withTimeout)(this.nodeToNode.connectToNode(nodeId, trackerId, !reattempt), this.nodeConnectTimeout);
            this.disconnectionManager.cancelScheduledDisconnection(nodeId);
            this.subscribeToStreamPartOnNode(nodeId, streamPartId, false);
            return nodeId;
        });
        return Promise.allSettled(subscribePromises);
    }
    async doSetProxies(streamPartId, contactNodeIds, direction, getUserId, connectionCount) {
        await this.proxyStreamConnectionClient.setProxies(streamPartId, contactNodeIds, direction, getUserId, connectionCount);
    }
    // Null source is used when a message is published by the node itself
    onDataReceived(streamMessage, source = null) {
        const streamPartId = streamMessage.getStreamPartID();
        if (!this.streamPartManager.isSetUp(streamPartId)) {
            return;
            // Check if the stream is set as one-directional and has inbound connection if message is content typed
        }
        else if (source
            && this.streamPartManager.isSetUp(streamPartId)
            && this.streamPartManager.isBehindProxy(streamPartId)
            && streamMessage.messageType === protocol_1.StreamMessageType.MESSAGE
            && !this.streamPartManager.hasInboundConnection(streamPartId, source)) {
            logger.warn('Received unexpected message on outbound proxy stream', {
                source,
                streamPartId
            });
            return;
        }
        this.emit(Event.MESSAGE_RECEIVED, streamMessage, source);
        // Check duplicate
        let isUnseen;
        try {
            isUnseen = this.streamPartManager.markNumbersAndCheckThatIsNotDuplicate(streamMessage.messageId, streamMessage.prevMsgRef);
        }
        catch (err) {
            if (err instanceof DuplicateMessageDetector_1.InvalidNumberingError) {
                logger.trace('Received message with invalid numbering', {
                    source,
                    messageId: streamMessage.messageId
                });
                return;
            }
            if (err instanceof DuplicateMessageDetector_1.GapMisMatchError) {
                logger.warn('Received data with gap mismatch', {
                    source,
                    messageId: streamMessage.messageId,
                    err
                });
                return;
            }
            throw err;
        }
        if (isUnseen) {
            logger.trace('Received message', {
                source,
                messageId: streamMessage.messageId
            });
            const propagationTargets = this.getPropagationTargets(streamMessage);
            this.emit(Event.UNSEEN_MESSAGE_RECEIVED, streamMessage, source);
            this.propagation.feedUnseenMessage(streamMessage, propagationTargets, source);
            if (source === null) {
                this.metrics.publishMessagesPerSecond.record(1);
                this.metrics.publishBytesPerSecond.record(streamMessage.getSerializedContent().length);
            }
        }
        else {
            logger.trace('Ignored duplicate message', {
                source,
                messageId: streamMessage.messageId
            });
            this.emit(Event.DUPLICATE_MESSAGE_RECEIVED, streamMessage, source);
        }
    }
    stop() {
        this.proxyStreamConnectionClient.stop();
        this.proxyStreamConnectionServer.stop();
        this.disconnectionManager.stop();
        this.nodeToNode.stop();
        return this.trackerManager.stop();
    }
    getPropagationTargets(streamMessage) {
        const streamPartId = streamMessage.getStreamPartID();
        let propagationTargets = [];
        propagationTargets = propagationTargets.concat([...this.streamPartManager.getOutboundNodesForStreamPart(streamPartId)]);
        if (this.acceptProxyConnections) {
            if (protocol_1.GroupKeyRequest.is(streamMessage) || protocol_1.GroupKeyResponse.is(streamMessage)) {
                const { recipient } = protocol_1.GroupKeyRequest.fromStreamMessage(streamMessage);
                propagationTargets = propagationTargets.concat(this.proxyStreamConnectionServer.getNodeIdsForUserId(streamPartId, recipient));
            }
        }
        else if (this.streamPartManager.isBehindProxy(streamMessage.getStreamPartID())
            && this.proxyStreamConnectionClient.isProxiedStreamPart(streamMessage.getStreamPartID(), protocol_1.ProxyDirection.SUBSCRIBE)) {
            propagationTargets = propagationTargets.concat([...this.streamPartManager.getInboundNodesForStreamPart(streamPartId)]);
        }
        return propagationTargets;
    }
    subscribeToStreamPartOnNode(node, streamPartId, sendStatus = true) {
        this.streamPartManager.addNeighbor(streamPartId, node);
        this.propagation.onNeighborJoined(node, streamPartId);
        if (sendStatus) {
            this.trackerManager.sendStreamPartStatus(streamPartId);
        }
        this.emit(Event.NODE_SUBSCRIBED, node, streamPartId);
        return node;
    }
    unsubscribeFromStreamPartOnNode(node, streamPartId, sendStatus = true) {
        this.streamPartManager.removeNodeFromStreamPart(streamPartId, node);
        logger.trace('unsubscribeFromStreamPartOnNode', { node, streamPartId });
        this.emit(Event.NODE_UNSUBSCRIBED, node, streamPartId);
        this.disconnectionManager.scheduleDisconnectionIfNoSharedStreamParts(node);
        if (sendStatus) {
            this.trackerManager.sendStreamPartStatus(streamPartId);
        }
    }
    onNodeDisconnected(node) {
        const [streams, proxiedStreams] = this.streamPartManager.removeNodeFromAllStreamParts(node);
        logger.trace('Remove all subscriptions of node', { node });
        streams.forEach((s) => {
            this.trackerManager.sendStreamPartStatus(s);
        });
        proxiedStreams.forEach((s) => {
            setImmediate(async () => this.proxyStreamConnectionClient.onNodeDisconnected(s, node));
        });
        this.emit(Event.NODE_DISCONNECTED, node);
    }
    getStreamParts() {
        return this.streamPartManager.getStreamParts();
    }
    getNeighbors() {
        return this.streamPartManager.getAllNodes();
    }
    getNodeId() {
        return this.peerInfo.peerId;
    }
    getMetricsContext() {
        return this.metricsContext;
    }
    getDiagnosticInfo() {
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
        };
    }
    async subscribeAndWaitForJoinOperation(streamPartId, timeout = this.nodeConnectTimeout) {
        if (this.streamPartManager.isSetUp(streamPartId)) {
            return this.streamPartManager.getAllNodesForStreamPart(streamPartId).length;
        }
        let resolveHandler;
        let rejectHandler;
        const res = await Promise.all([
            (0, utils_2.withTimeout)(new Promise((resolve, reject) => {
                resolveHandler = (stream, numOfNeighbors) => {
                    if (stream === streamPartId) {
                        resolve(numOfNeighbors);
                    }
                };
                rejectHandler = (stream, error) => {
                    if (stream === streamPartId) {
                        reject(new Error(error));
                    }
                };
                this.on(Event.JOIN_COMPLETED, resolveHandler);
                this.on(Event.JOIN_FAILED, rejectHandler);
            }), timeout),
            this.subscribeToStreamIfHaveNotYet(streamPartId)
        ]).finally(() => {
            this.off(Event.JOIN_COMPLETED, resolveHandler);
            this.off(Event.JOIN_FAILED, rejectHandler);
        });
        return res[0];
    }
    emitJoinCompleted(streamPartId, numOfNeighbors) {
        this.emit(Event.JOIN_COMPLETED, streamPartId, numOfNeighbors);
    }
    emitJoinFailed(streamPartId, error) {
        this.emit(Event.JOIN_FAILED, streamPartId, error);
    }
    isProxiedStreamPart(streamPartId, direction) {
        return this.streamPartManager.isBehindProxy(streamPartId) && this.proxyStreamConnectionClient.isProxiedStreamPart(streamPartId, direction);
    }
}
exports.Node = Node;
//# sourceMappingURL=Node.js.map