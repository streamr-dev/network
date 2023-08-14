"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstructionRetryManager = void 0;
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
class InstructionRetryManager {
    constructor(handleFn, intervalInMs) {
        this.handleFn = handleFn;
        this.intervalInMs = intervalInMs;
        this.instructionRetryIntervals = {};
        this.statusSendCounterLimit = 9;
        this.stopped = false;
    }
    add(instructionMessage, trackerId) {
        if (this.stopped) {
            return;
        }
        const streamPartId = instructionMessage.getStreamPartID();
        if (this.instructionRetryIntervals[streamPartId]) {
            clearTimeout(this.instructionRetryIntervals[streamPartId].interval);
        }
        this.instructionRetryIntervals[streamPartId] = {
            interval: setTimeout(() => this.retryFunction(instructionMessage, trackerId), this.intervalInMs),
            counter: 0
        };
    }
    async retryFunction(instructionMessage, trackerId) {
        if (this.stopped) {
            return;
        }
        const streamPartId = instructionMessage.getStreamPartID();
        try {
            // First and every nth instruction retries will always send status messages to tracker
            await this.handleFn(instructionMessage, trackerId, this.instructionRetryIntervals[streamPartId].counter !== 0);
        }
        catch (err) {
            logger.warn('Encountered error handling instruction', err);
        }
        // Check that stream has not been removed
        if (this.instructionRetryIntervals[streamPartId]) {
            if (this.instructionRetryIntervals[streamPartId].counter >= this.statusSendCounterLimit) {
                this.instructionRetryIntervals[streamPartId].counter = 0;
            }
            else {
                this.instructionRetryIntervals[streamPartId].counter += 1;
            }
            clearTimeout(this.instructionRetryIntervals[streamPartId].interval);
            this.instructionRetryIntervals[streamPartId].interval = setTimeout(() => this.retryFunction(instructionMessage, trackerId), this.intervalInMs);
        }
    }
    removeStreamPart(streamPartId) {
        if (this.stopped) {
            return;
        }
        if (streamPartId in this.instructionRetryIntervals) {
            clearTimeout(this.instructionRetryIntervals[streamPartId].interval);
            delete this.instructionRetryIntervals[streamPartId];
            logger.debug('Removed', { streamPartId });
        }
    }
    stop() {
        Object.values(this.instructionRetryIntervals).forEach((obj) => {
            clearTimeout(obj.interval);
            obj.counter = 0;
        });
        this.instructionRetryIntervals = {};
        this.stopped = true;
    }
}
exports.InstructionRetryManager = InstructionRetryManager;
//# sourceMappingURL=InstructionRetryManager.js.map