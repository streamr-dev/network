"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstructionSender = void 0;
const lodash_1 = __importDefault(require("lodash"));
const streamr_network_1 = require("streamr-network");
/**
 * Instructions are collected to buffers and sent after a short delay. For each stream
 * part there is a separate buffer.
 *
 * We use debouncing to delay the sending. It means that we send the buffered instructions
 * when either of these conditions is satisfied:
 * - the topology stabilizes: no new instructions has been formed for the stream part
 *   in X milliseconds
 * - the buffer times out: we have buffered an instruction for Y milliseconds
 *
 * When an instruction is added to a the buffer, it may overwrite an existing
 * instruction in the buffer if the both instructions share the same nodeId. In that
 * situation we expect that the previous instruction is no longer valid (it has a lower
 * counterValue) and can be ignored.
 */
const DEFAULT_TOPOLOGY_STABILIZATION_OPTIONS = {
    debounceWait: 100,
    maxWait: 2000
};
const logger = new streamr_network_1.Logger(module);
class StreamPartInstructionBuffer {
    constructor(options, onReady) {
        this.instructions = new Map();
        this.debouncedOnReady = lodash_1.default.debounce(onReady, options.debounceWait, {
            maxWait: options.maxWait
        });
    }
    addInstruction(instruction) {
        // may overwrite an earlier instruction for the same node
        this.instructions.set(instruction.nodeId, instruction);
        this.debouncedOnReady();
    }
    getInstructions() {
        return this.instructions.values();
    }
    stop() {
        this.debouncedOnReady.cancel();
    }
}
class InstructionSender {
    constructor(options, sendInstruction, metrics) {
        this.streamPartBuffers = new Map();
        this.options = options !== null && options !== void 0 ? options : DEFAULT_TOPOLOGY_STABILIZATION_OPTIONS;
        this.sendInstruction = sendInstruction;
        this.metrics = metrics
            .addRecordedMetric('instructionsSent');
    }
    addInstruction(instruction) {
        this.getOrCreateBuffer(instruction.streamPartId).addInstruction(instruction);
    }
    stop() {
        this.streamPartBuffers.forEach((entry) => entry.stop());
    }
    getOrCreateBuffer(streamPartId) {
        const existingBuffer = this.streamPartBuffers.get(streamPartId);
        if (existingBuffer !== undefined) {
            return existingBuffer;
        }
        const newBuffer = new StreamPartInstructionBuffer(this.options, () => {
            var _a;
            (_a = this.streamPartBuffers.get(streamPartId)) === null || _a === void 0 ? void 0 : _a.stop();
            this.streamPartBuffers.delete(streamPartId);
            this.sendInstructions(newBuffer);
        });
        this.streamPartBuffers.set(streamPartId, newBuffer);
        return newBuffer;
    }
    async sendInstructions(buffer) {
        const promises = Array.from(buffer.getInstructions())
            .map(async ({ nodeId, streamPartId, newNeighbors, counterValue }) => {
            this.metrics.record('instructionsSent', 1);
            try {
                await this.sendInstruction(nodeId, streamPartId, newNeighbors, counterValue);
                logger.debug('instruction %o sent to node %o', newNeighbors, { counterValue, streamPartId, nodeId });
            }
            catch (err) {
                logger.error('failed to send instructions %o to node %o, reason: %s', newNeighbors, { counterValue, streamPartId, nodeId }, err);
            }
        });
        await Promise.allSettled(promises);
    }
}
exports.InstructionSender = InstructionSender;
//# sourceMappingURL=InstructionSender.js.map