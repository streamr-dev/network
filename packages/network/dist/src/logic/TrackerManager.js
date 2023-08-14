"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrackerManager = void 0;
const protocol_1 = require("@streamr/protocol");
const TrackerConnector_1 = require("./TrackerConnector");
const NodeToTracker_1 = require("../protocol/NodeToTracker");
const utils_1 = require("@streamr/utils");
const InstructionThrottler_1 = require("./InstructionThrottler");
const InstructionRetryManager_1 = require("./InstructionRetryManager");
const NameDirectory_1 = require("../NameDirectory");
const logger = new utils_1.Logger(module);
class TrackerManager {
    constructor(nodeToTracker, opts, streamPartManager, getNodeDescriptor, subscriber) {
        this.rttUpdateTimeoutsOnTrackers = {};
        this.nodeToTracker = nodeToTracker;
        this.streamPartManager = streamPartManager;
        this.trackerRegistry = (0, protocol_1.createTrackerRegistry)(opts.trackers);
        this.getNodeDescriptor = getNodeDescriptor;
        this.subscriber = subscriber;
        this.rttUpdateInterval = opts.rttUpdateTimeout;
        this.trackerConnector = new TrackerConnector_1.TrackerConnector(streamPartManager.getStreamParts.bind(streamPartManager), this.nodeToTracker.connectToTracker.bind(this.nodeToTracker), this.nodeToTracker.disconnectFromTracker.bind(this.nodeToTracker), this.trackerRegistry, opts.trackerConnectionMaintenanceInterval);
        this.instructionThrottler = new InstructionThrottler_1.InstructionThrottler(this.handleTrackerInstruction.bind(this));
        this.instructionRetryManager = new InstructionRetryManager_1.InstructionRetryManager(this.handleTrackerInstruction.bind(this), opts.instructionRetryInterval || 3 * 60 * 1000);
        this.nodeToTracker.on(NodeToTracker_1.Event.CONNECTED_TO_TRACKER, (trackerId) => {
            logger.trace('Connected to tracker', { trackerId });
            this.getStreamPartsForTracker(trackerId).forEach((streamPart) => {
                this.sendStatus(streamPart, trackerId);
            });
        });
        this.nodeToTracker.on(NodeToTracker_1.Event.STATUS_ACK_RECEIVED, (statusAckMessage) => {
            const streamPartId = statusAckMessage.getStreamPartID();
            if (this.streamPartManager.isSetUp(streamPartId) && this.streamPartManager.isNewStream(streamPartId)) {
                this.subscriber.emitJoinCompleted(streamPartId, 0);
            }
        });
        this.nodeToTracker.on(NodeToTracker_1.Event.TRACKER_INSTRUCTION_RECEIVED, (instructionMessage, trackerId) => {
            this.instructionThrottler.add(instructionMessage, trackerId);
        });
        this.nodeToTracker.on(NodeToTracker_1.Event.TRACKER_DISCONNECTED, (trackerId) => {
            logger.trace('Disconnected from tracker', { trackerId });
        });
    }
    sendStreamPartStatus(streamPartId) {
        const trackerId = this.getTrackerId(streamPartId);
        this.sendStatus(streamPartId, trackerId);
    }
    onNewStreamPart(streamPartId) {
        this.trackerConnector.onNewStreamPart(streamPartId);
    }
    async addSignallingOnlySession(streamPartId, nodeToSignal) {
        await this.trackerConnector.addSignallingOnlySession(streamPartId, nodeToSignal);
    }
    removeSignallingOnlySession(streamPartId, nodeToSignal) {
        this.trackerConnector.removeSignallingOnlySession(streamPartId, nodeToSignal);
    }
    onUnsubscribeFromStreamPart(streamPartId) {
        this.instructionThrottler.removeStreamPart(streamPartId);
        this.instructionRetryManager.removeStreamPart(streamPartId);
    }
    start() {
        this.trackerConnector.start();
    }
    async stop() {
        this.instructionThrottler.stop();
        this.instructionRetryManager.stop();
        this.trackerConnector.stop();
        Object.values(this.rttUpdateTimeoutsOnTrackers).forEach((timeout) => clearTimeout(timeout));
        await this.nodeToTracker.stop();
    }
    getStreamPartsForTracker(trackerId) {
        return [...this.streamPartManager.getStreamParts()]
            .filter((streamPartId) => this.getTrackerId(streamPartId) === trackerId);
    }
    shouldIncludeRttInfo(trackerId) {
        if (!(trackerId in this.rttUpdateTimeoutsOnTrackers)) {
            this.rttUpdateTimeoutsOnTrackers[trackerId] = setTimeout(() => {
                logger.trace('Triggered RTT update timeout to tracker', { trackerId });
                delete this.rttUpdateTimeoutsOnTrackers[trackerId];
            }, this.rttUpdateInterval);
            return true;
        }
        return false;
    }
    async sendStatus(streamPartId, trackerId) {
        if (!this.streamPartManager.isBehindProxy(streamPartId)) {
            const nodeDescriptor = this.getNodeDescriptor(this.shouldIncludeRttInfo(trackerId));
            const status = {
                streamPart: this.streamPartManager.getStreamPartStatus(streamPartId),
                ...nodeDescriptor
            };
            try {
                await this.nodeToTracker.sendStatus(trackerId, status);
                logger.trace('Sent status to tracker', {
                    streamPartId: status.streamPart,
                    trackerId
                });
            }
            catch (err) {
                logger.trace('Failed to send status to tracker', { err, trackerId });
            }
        }
    }
    async handleTrackerInstruction(instructionMessage, trackerId, reattempt = false) {
        const streamPartId = instructionMessage.getStreamPartID();
        if (!this.streamPartManager.isSetUp(streamPartId)) {
            return;
        }
        const { nodeIds, counter } = instructionMessage;
        this.instructionRetryManager.add(instructionMessage, trackerId);
        // Check that tracker matches expected tracker
        const expectedTrackerId = this.getTrackerId(streamPartId);
        if (trackerId !== expectedTrackerId) {
            logger.warn('Received instructions from unexpected tracker', {
                expectedTrackerId,
                trackerId
            });
            return;
        }
        logger.trace('Receive instructions', { streamPartId, nodeIds });
        const currentNodes = this.streamPartManager.getNeighborsForStreamPart(streamPartId);
        const nodesToUnsubscribeFrom = currentNodes.filter((nodeId) => !nodeIds.includes(nodeId));
        nodesToUnsubscribeFrom.forEach((nodeId) => {
            this.subscriber.unsubscribeFromStreamPartOnNode(nodeId, streamPartId, false);
        });
        const results = await this.subscriber.subscribeToStreamPartOnNodes(nodeIds, streamPartId, trackerId, reattempt);
        let newStream = false;
        if (this.streamPartManager.isSetUp(streamPartId)) {
            newStream = this.streamPartManager.isNewStream(streamPartId);
            this.streamPartManager.updateCounter(streamPartId, counter);
        }
        // Log success / failures
        const subscribedNodeIds = [];
        const unsubscribedNodeIds = [];
        let failedInstructions = false;
        results.forEach((res, i) => {
            if (res.status === 'fulfilled') {
                subscribedNodeIds.push(res.value);
            }
            else {
                failedInstructions = true;
                logger.debug('Failed to subscribe to node', {
                    nodeId: NameDirectory_1.NameDirectory.getName(nodeIds[i]),
                    reason: res.reason
                });
            }
        });
        if (!reattempt || failedInstructions) {
            this.sendStreamPartStatus(streamPartId);
        }
        if (newStream) {
            if (subscribedNodeIds.length === 0) {
                this.subscriber.emitJoinFailed(streamPartId, `Failed initial join operation to stream partition ${streamPartId}, failed to form connections to all target neighbors`);
            }
            else {
                this.subscriber.emitJoinCompleted(streamPartId, subscribedNodeIds.length);
            }
        }
        logger.trace('Fulfilled tracker instructions', {
            subscribedNodeIds,
            unsubscribedNodeIds,
            streamPartId,
            counter,
            fullFilledAll: subscribedNodeIds.length === nodeIds.length
        });
    }
    getTrackerId(streamPartId) {
        return this.trackerRegistry.getTracker(streamPartId).id;
    }
    getTrackerAddress(streamPartId) {
        return this.trackerRegistry.getTracker(streamPartId).ws;
    }
    getDiagnosticInfo() {
        return this.nodeToTracker.getDiagnosticInfo();
    }
}
exports.TrackerManager = TrackerManager;
//# sourceMappingURL=TrackerManager.js.map