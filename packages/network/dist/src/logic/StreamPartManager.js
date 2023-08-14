"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamPartManager = void 0;
const protocol_1 = require("@streamr/protocol");
const DuplicateMessageDetector_1 = require("./DuplicateMessageDetector");
const constants_1 = require("../constants");
const uniq_1 = __importDefault(require("lodash/uniq"));
function keyForDetector({ publisherId, msgChainId }) {
    return `${publisherId}-${msgChainId}`;
}
class StreamPartManager {
    constructor() {
        this.streamParts = new Map();
    }
    setUpStreamPart(streamPartId, isBehindProxy = false) {
        if (this.isSetUp(streamPartId)) {
            throw new Error(`Stream part ${streamPartId} already set up`);
        }
        this.streamParts.set(streamPartId, {
            detectors: new Map(),
            neighbors: new Set(),
            counter: 0,
            inOnly: new Set(),
            outOnly: new Set(),
            isBehindProxy
        });
    }
    markNumbersAndCheckThatIsNotDuplicate(messageId, previousMessageReference) {
        const streamPartId = messageId.getStreamPartID();
        this.ensureThatIsSetUp(streamPartId);
        const detectorKey = keyForDetector(messageId);
        const { detectors } = this.streamParts.get(streamPartId);
        if (!detectors.has(detectorKey)) {
            detectors.set(detectorKey, new DuplicateMessageDetector_1.DuplicateMessageDetector());
        }
        return detectors.get(detectorKey).markAndCheck(previousMessageReference === null
            ? null
            : new DuplicateMessageDetector_1.NumberPair(previousMessageReference.timestamp, previousMessageReference.sequenceNumber), new DuplicateMessageDetector_1.NumberPair(messageId.timestamp, messageId.sequenceNumber));
    }
    updateCounter(streamPartId, counter) {
        this.streamParts.get(streamPartId).counter = counter;
    }
    isNewStream(streamPartId) {
        this.ensureThatIsSetUp(streamPartId);
        return this.streamParts.get(streamPartId).counter === 0;
    }
    addNeighbor(streamPartId, node) {
        this.ensureThatIsSetUp(streamPartId);
        const { neighbors } = this.streamParts.get(streamPartId);
        neighbors.add(node);
    }
    addInOnlyNeighbor(streamPartId, node) {
        this.ensureThatIsSetUp(streamPartId);
        const { inOnly } = this.streamParts.get(streamPartId);
        inOnly.add(node);
    }
    addOutOnlyNeighbor(streamPartId, node) {
        this.ensureThatIsSetUp(streamPartId);
        const { outOnly } = this.streamParts.get(streamPartId);
        outOnly.add(node);
    }
    removeNodeFromStreamPart(streamPartId, node) {
        this.ensureThatIsSetUp(streamPartId);
        const { neighbors, inOnly, outOnly } = this.streamParts.get(streamPartId);
        neighbors.delete(node);
        inOnly.delete(node);
        outOnly.delete(node);
    }
    getStreamPartStatus(streamPartId) {
        const state = this.streamParts.get(streamPartId);
        const [id, partition] = protocol_1.StreamPartIDUtils.getStreamIDAndPartition(streamPartId);
        if (state !== undefined) {
            return {
                id,
                partition,
                neighbors: [...state.neighbors],
                counter: state.counter
            };
        }
        else {
            return {
                id,
                partition,
                neighbors: [],
                counter: constants_1.COUNTER_UNSUBSCRIBE
            };
        }
    }
    removeNodeFromAllStreamParts(node) {
        const streamParts = [];
        const notRemovedProxies = [];
        this.streamParts.forEach(({ neighbors, inOnly, outOnly }, streamPartId) => {
            const isRemoved = neighbors.delete(node);
            if (isRemoved) {
                streamParts.push(streamPartId);
            }
            if (this.isBehindProxy(streamPartId)) {
                notRemovedProxies.push(streamPartId);
            }
            else {
                inOnly.delete(node);
                outOnly.delete(node);
            }
        });
        return [streamParts, notRemovedProxies];
    }
    removeStreamPart(streamPartId) {
        this.ensureThatIsSetUp(streamPartId);
        this.streamParts.delete(streamPartId);
    }
    isSetUp(streamPartId) {
        return this.streamParts.has(streamPartId);
    }
    isNodePresent(node) {
        return [...this.streamParts.values()].some(({ neighbors, inOnly, outOnly }) => {
            return neighbors.has(node) || inOnly.has(node) || outOnly.has(node);
        });
    }
    getStreamParts() {
        return this.streamParts.keys();
    }
    getNeighborsForStreamPart(streamPartId) {
        this.ensureThatIsSetUp(streamPartId);
        return [...this.streamParts.get(streamPartId).neighbors];
    }
    getOutboundNodesForStreamPart(streamPartId) {
        this.ensureThatIsSetUp(streamPartId);
        const { neighbors, outOnly } = this.streamParts.get(streamPartId);
        return [...neighbors, ...outOnly];
    }
    getInboundNodesForStreamPart(streamPartId) {
        this.ensureThatIsSetUp(streamPartId);
        const { neighbors, inOnly } = this.streamParts.get(streamPartId);
        return [...neighbors, ...inOnly];
    }
    getAllNodesForStreamPart(streamPartId) {
        this.ensureThatIsSetUp(streamPartId);
        const { neighbors, inOnly, outOnly } = this.streamParts.get(streamPartId);
        return [...neighbors, ...inOnly, ...outOnly];
    }
    getAllNodes() {
        const nodes = [];
        this.streamParts.forEach(({ neighbors }) => {
            nodes.push(...neighbors);
        });
        return (0, uniq_1.default)(nodes);
    }
    hasNeighbor(streamPartId, node) {
        this.ensureThatIsSetUp(streamPartId);
        return this.streamParts.get(streamPartId).neighbors.has(node);
    }
    hasOutOnlyConnection(streamPartId, node) {
        this.ensureThatIsSetUp(streamPartId);
        return this.streamParts.get(streamPartId).outOnly.has(node);
    }
    hasInOnlyConnection(streamPartId, node) {
        this.ensureThatIsSetUp(streamPartId);
        return this.streamParts.get(streamPartId).inOnly.has(node);
    }
    hasOnewayConnection(streamPartId, node) {
        this.ensureThatIsSetUp(streamPartId);
        return this.streamParts.get(streamPartId).outOnly.has(node) || this.streamParts.get(streamPartId).inOnly.has(node);
    }
    hasInboundConnection(streamPartId, node) {
        return this.hasInOnlyConnection(streamPartId, node) || this.hasNeighbor(streamPartId, node);
    }
    isBehindProxy(streamPartId) {
        return this.isSetUp(streamPartId) && this.streamParts.get(streamPartId).isBehindProxy;
    }
    getDiagnosticInfo() {
        const state = {};
        for (const streamPartId of this.getStreamParts()) {
            state[streamPartId] = this.getNeighborsForStreamPart(streamPartId);
        }
        return state;
    }
    ensureThatIsSetUp(streamPartId) {
        if (!this.isSetUp(streamPartId)) {
            throw new Error(`Stream part ${streamPartId} is not set up`);
        }
    }
}
exports.StreamPartManager = StreamPartManager;
//# sourceMappingURL=StreamPartManager.js.map