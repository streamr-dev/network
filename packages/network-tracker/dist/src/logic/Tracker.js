"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tracker = exports.convertTestNet3Status = exports.Event = void 0;
const events_1 = require("events");
const protocol_1 = require("@streamr/protocol");
const TrackerServer_1 = require("../protocol/TrackerServer");
const OverlayTopology_1 = require("./OverlayTopology");
const InstructionCounter_1 = require("./InstructionCounter");
const LocationManager_1 = require("./LocationManager");
const attachMessageRelaying_1 = require("./attachMessageRelaying");
const network_node_1 = require("@streamr/network-node");
const utils_1 = require("@streamr/utils");
const InstructionAndStatusAckSender_1 = require("./InstructionAndStatusAckSender");
const SchemaValidators_1 = require("../helpers/SchemaValidators");
var Event;
(function (Event) {
    Event["NODE_CONNECTED"] = "streamr:tracker:node-connected";
})(Event || (exports.Event = Event = {}));
// TODO: Testnet (3rd iteration) compatibility, rm when no more testnet nodes
function convertTestNet3Status(statusMessage) {
    if (statusMessage.status.stream !== undefined) {
        const { streamKey } = statusMessage.status.stream;
        let id = '';
        let partition = 0;
        if (streamKey !== undefined) {
            const [parsedId, parsedPartition] = streamKey.split('::');
            if (parsedId !== undefined) {
                id = parsedId;
            }
            if (parsedPartition !== undefined) {
                partition = parseInt(parsedPartition, 10);
            }
        }
        let neighbors = [];
        if (statusMessage.status.stream.inboundNodes !== undefined) {
            neighbors = statusMessage.status.stream.inboundNodes;
        }
        let counter = 0;
        if (statusMessage.status.stream.counter !== undefined) {
            counter = parseInt(statusMessage.status.stream.counter, 10);
        }
        // eslint-disable-next-line no-param-reassign
        statusMessage.status = {
            ...statusMessage.status,
            streamPart: {
                id,
                partition,
                neighbors,
                counter
            }
        };
    }
}
exports.convertTestNet3Status = convertTestNet3Status;
const logger = new utils_1.Logger(module);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class Tracker extends events_1.EventEmitter {
    constructor(opts) {
        super();
        this.stopped = false;
        if (!Number.isInteger(opts.maxNeighborsPerNode)) {
            throw new Error('maxNeighborsPerNode is not an integer');
        }
        if (!(opts.protocols.trackerServer instanceof TrackerServer_1.TrackerServer)) {
            throw new Error('Provided protocols are not correct');
        }
        const metricsContext = opts.metricsContext || new utils_1.MetricsContext();
        this.maxNeighborsPerNode = opts.maxNeighborsPerNode;
        this.trackerServer = opts.protocols.trackerServer;
        this.peerInfo = opts.peerInfo;
        this.overlayPerStreamPart = {};
        this.overlayConnectionRtts = {};
        this.locationManager = new LocationManager_1.LocationManager();
        this.instructionCounter = new InstructionCounter_1.InstructionCounter();
        this.extraMetadatas = Object.create(null);
        this.statusSchemaValidator = new SchemaValidators_1.StatusValidator();
        this.trackerServer.on(TrackerServer_1.Event.NODE_CONNECTED, (nodeId) => {
            this.onNodeConnected(nodeId);
        });
        this.trackerServer.on(TrackerServer_1.Event.NODE_DISCONNECTED, (nodeId) => {
            this.onNodeDisconnected(nodeId);
        });
        this.trackerServer.on(TrackerServer_1.Event.NODE_STATUS_RECEIVED, (statusMessage, nodeId) => {
            convertTestNet3Status(statusMessage);
            const valid = this.statusSchemaValidator.validate(statusMessage.status, statusMessage.version);
            if (valid) {
                this.processNodeStatus(statusMessage, nodeId);
            }
            else {
                logger.warn('Received status message with invalid format', { nodeId });
                this.trackerServer.disconnectFromPeer(nodeId, network_node_1.DisconnectionCode.INVALID_PROTOCOL_MESSAGE, network_node_1.DisconnectionReason.INVALID_PROTOCOL_MESSAGE);
            }
        });
        (0, attachMessageRelaying_1.attachMessageRelaying)(this.trackerServer);
        this.metrics = {
            nodeDisconnected: new utils_1.RateMetric(),
            nodeStatusProcessed: new utils_1.RateMetric()
        };
        metricsContext.addMetrics('tracker', this.metrics);
        this.instructionAndStatusAckSender = new InstructionAndStatusAckSender_1.InstructionAndStatusAckSender(opts.topologyStabilization, this.trackerServer.sendInstruction.bind(this.trackerServer), this.trackerServer.sendStatusAck.bind(this.trackerServer), metricsContext);
    }
    onNodeConnected(node) {
        this.emit(Event.NODE_CONNECTED, node);
    }
    onNodeDisconnected(node) {
        logger.debug('Disconnected from node', { node });
        this.metrics.nodeDisconnected.record(1);
        this.removeNode(node);
    }
    processNodeStatus(statusMessage, source) {
        if (this.stopped) {
            return;
        }
        this.metrics.nodeStatusProcessed.record(1);
        const status = statusMessage.status;
        const isMostRecent = this.instructionCounter.isMostRecent(status, source);
        if (!isMostRecent) {
            return;
        }
        // update RTTs and location
        if (status.rtts) {
            this.overlayConnectionRtts[source] = status.rtts;
        }
        this.locationManager.updateLocation({
            nodeId: source,
            location: status.location,
            address: this.trackerServer.resolveAddress(source),
        });
        this.extraMetadatas[source] = status.extra;
        const streamPartId = (0, protocol_1.toStreamPartID)(status.streamPart.id, status.streamPart.partition);
        // update topology
        this.createTopology(streamPartId);
        this.updateNodeOnStream(source, status.streamPart);
        this.formAndSendInstructions(source, true, streamPartId);
    }
    async stop() {
        this.instructionAndStatusAckSender.stop();
        await this.trackerServer.stop();
        this.stopped = true;
    }
    // Utility method for tests
    getUrl() {
        return this.trackerServer.getUrl();
    }
    createTopology(streamPartId) {
        if (this.overlayPerStreamPart[streamPartId] == null) {
            this.overlayPerStreamPart[streamPartId] = new OverlayTopology_1.OverlayTopology(this.maxNeighborsPerNode);
        }
    }
    updateNodeOnStream(node, status) {
        const streamPartId = (0, protocol_1.toStreamPartID)(status.id, status.partition);
        if (status.counter === network_node_1.COUNTER_UNSUBSCRIBE) {
            this.leaveAndCheckEmptyOverlay(streamPartId, this.overlayPerStreamPart[streamPartId], node);
        }
        else {
            this.overlayPerStreamPart[streamPartId].update(node, status.neighbors);
        }
    }
    formAndSendInstructions(node, isRespondingToNodeStatus, streamPartId, forceGenerate = false) {
        if (this.stopped) {
            return;
        }
        const overlay = this.overlayPerStreamPart[streamPartId];
        if (overlay !== undefined) {
            const instructions = overlay.formInstructions(node, forceGenerate);
            const isAloneInTopology = overlay.hasNode(node) && overlay.getNumberOfNodes() === 1;
            if (!isAloneInTopology || !isRespondingToNodeStatus || Object.keys(instructions).length > 0) {
                Object.entries(instructions).forEach(([nodeId, newNeighbors]) => {
                    const counterValue = this.instructionCounter.setOrIncrement(nodeId, streamPartId);
                    this.instructionAndStatusAckSender.addInstruction({
                        nodeId,
                        streamPartId,
                        newNeighbors,
                        counterValue
                    });
                });
            }
            else {
                // Send empty instruction if and only if the node is alone in the topology
                this.instructionAndStatusAckSender.addStatusAck({
                    nodeId: node,
                    streamPartId
                });
            }
        }
    }
    removeNode(node) {
        delete this.overlayConnectionRtts[node];
        this.locationManager.removeNode(node);
        delete this.extraMetadatas[node];
        Object.entries(this.overlayPerStreamPart)
            .forEach(([streamPartId, overlayTopology]) => {
            this.leaveAndCheckEmptyOverlay(streamPartId, overlayTopology, node);
        });
    }
    leaveAndCheckEmptyOverlay(streamPartId, overlayTopology, node) {
        const neighbors = overlayTopology.leave(node);
        this.instructionCounter.removeNodeFromStreamPart(node, streamPartId);
        if (overlayTopology.isEmpty()) {
            this.instructionCounter.removeStreamPart(streamPartId);
            delete this.overlayPerStreamPart[streamPartId];
        }
        else {
            neighbors.forEach((neighbor) => {
                this.formAndSendInstructions(neighbor, false, streamPartId, true);
            });
        }
    }
    getStreamParts() {
        return Object.keys(this.overlayPerStreamPart);
    }
    getAllNodeLocations() {
        return this.locationManager.getAllNodeLocations();
    }
    getAllExtraMetadatas() {
        return this.extraMetadatas;
    }
    getNodes() {
        return this.trackerServer.getNodeIds();
    }
    getNodeLocation(node) {
        return this.locationManager.getNodeLocation(node);
    }
    getOverlayConnectionRtts() {
        return this.overlayConnectionRtts;
    }
    getOverlayPerStreamPart() {
        return this.overlayPerStreamPart;
    }
    getConfigRecord() {
        return {
            id: this.peerInfo.peerId,
            http: this.getUrl().replace(/^ws/, 'http'),
            ws: this.getUrl()
        };
    }
    getTrackerId() {
        return this.peerInfo.peerId;
    }
}
exports.Tracker = Tracker;
//# sourceMappingURL=Tracker.js.map