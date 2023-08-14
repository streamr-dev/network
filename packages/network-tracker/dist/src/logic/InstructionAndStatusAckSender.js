"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstructionAndStatusAckSender = void 0;
const debounce_1 = __importDefault(require("lodash/debounce"));
const utils_1 = require("@streamr/utils");
/**
 * Instructions and status acks, i.e. "entries", are collected to buffers and sent
 * after a short delay. For each stream part there is a separate buffer.
 *
 * We use debouncing to delay the sending. It means that we send the buffered entries
 * when either of these conditions is satisfied:
 * - the topology stabilizes: no new entries have been added to the stream part in X milliseconds
 * - the buffer times out: we have buffered an entry for Y milliseconds
 *
 * When an entry is added to the buffer, it may overwrite an existing entry in the buffer if
 * both entries share the same nodeId. In that situation we expect that the previous entry
 * is no longer valid and can be ignored.
 */
const DEFAULT_TOPOLOGY_STABILIZATION_OPTIONS = {
    debounceWait: 100,
    maxWait: 2000
};
const logger = new utils_1.Logger(module);
function isInstruction(entry) {
    return entry.counterValue !== undefined;
}
class Buffer {
    constructor(options, onReady) {
        this.entries = new Map();
        this.debouncedOnReady = (0, debounce_1.default)(onReady, options.debounceWait, {
            maxWait: options.maxWait
        });
    }
    add(entry) {
        // may overwrite an earlier entry for the same node
        this.entries.set(entry.nodeId, entry);
        this.debouncedOnReady();
    }
    getAll() {
        return this.entries.values();
    }
    stop() {
        this.debouncedOnReady.cancel();
    }
}
class InstructionAndStatusAckSender {
    constructor(options, sendInstruction, sendStatusAck, metricsContext) {
        this.streamPartBuffers = new Map();
        this.options = options ?? DEFAULT_TOPOLOGY_STABILIZATION_OPTIONS;
        this.sendInstruction = sendInstruction;
        this.sendStatusAck = sendStatusAck;
        this.metrics = {
            instructionSent: new utils_1.RateMetric()
        };
        metricsContext.addMetrics('tracker', this.metrics);
    }
    addInstruction(instruction) {
        this.getOrCreateBuffer(instruction.streamPartId).add(instruction);
    }
    addStatusAck(statusAck) {
        this.getOrCreateBuffer(statusAck.streamPartId).add(statusAck);
    }
    stop() {
        this.streamPartBuffers.forEach((entry) => entry.stop());
    }
    getOrCreateBuffer(streamPartId) {
        const existingBuffer = this.streamPartBuffers.get(streamPartId);
        if (existingBuffer !== undefined) {
            return existingBuffer;
        }
        const newBuffer = new Buffer(this.options, () => {
            this.streamPartBuffers.get(streamPartId)?.stop();
            this.streamPartBuffers.delete(streamPartId);
            this.sendInstructions(newBuffer);
        });
        this.streamPartBuffers.set(streamPartId, newBuffer);
        return newBuffer;
    }
    async sendInstructions(buffer) {
        const promises = Array.from(buffer.getAll())
            .map(async (entry) => {
            this.metrics.instructionSent.record(1);
            try {
                if (isInstruction(entry)) {
                    const { nodeId, streamPartId, newNeighbors, counterValue } = entry;
                    await this.sendInstruction(nodeId, streamPartId, newNeighbors, counterValue);
                    logger.debug('Sent instruction', {
                        newNeighbors,
                        counterValue,
                        nodeId,
                        streamPartId
                    });
                }
                else {
                    const { nodeId, streamPartId } = entry;
                    await this.sendStatusAck(nodeId, streamPartId);
                    logger.debug('Sent status ack', {
                        nodeId,
                        streamPartId
                    });
                }
            }
            catch (err) {
                logger.warn('Failed to send instructions or ack', {
                    entry,
                    err
                });
            }
        });
        await Promise.allSettled(promises);
    }
}
exports.InstructionAndStatusAckSender = InstructionAndStatusAckSender;
//# sourceMappingURL=InstructionAndStatusAckSender.js.map