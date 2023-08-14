"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstructionThrottler = void 0;
const cancelable_promise_1 = require("cancelable-promise");
const utils_1 = require("@streamr/utils");
const logger = new utils_1.Logger(module);
/**
 * InstructionThrottler makes sure that
 *  1. no more than one instruction is handled at a time
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per stream part is kept in queue.
 */
class InstructionThrottler {
    constructor(handleFn) {
        this.queue = {};
        this.instructionCounter = {};
        this.handleFn = handleFn;
        this.ongoingPromises = {};
        this.stopped = false;
    }
    add(instructionMessage, trackerId) {
        if (this.stopped) {
            return;
        }
        const streamPartId = instructionMessage.getStreamPartID();
        if (!this.instructionCounter[streamPartId] || this.instructionCounter[streamPartId] <= instructionMessage.counter) {
            this.instructionCounter[streamPartId] = instructionMessage.counter;
            this.queue[streamPartId] = {
                instructionMessage,
                trackerId
            };
            if (!this.ongoingPromises[streamPartId]) {
                this.ongoingPromises[streamPartId] = {
                    promise: null,
                    handling: false
                };
            }
            if (!this.ongoingPromises[streamPartId].handling) {
                this.invokeHandleFnWithLock(streamPartId).catch((err) => {
                    logger.warn('Failed to handle instruction', err);
                });
            }
        }
    }
    removeStreamPart(streamPartId) {
        if (this.stopped) {
            return;
        }
        delete this.queue[streamPartId];
        delete this.instructionCounter[streamPartId];
        if (this.ongoingPromises[streamPartId]) {
            this.ongoingPromises[streamPartId].promise.cancel();
        }
        delete this.ongoingPromises[streamPartId];
    }
    isIdle() {
        return !Object.values(this.ongoingPromises).some((p) => p.handling);
    }
    stop() {
        this.queue = {};
        this.instructionCounter = {};
        Object.keys(this.ongoingPromises).forEach((streamPartId) => {
            if (this.ongoingPromises[streamPartId]) {
                this.ongoingPromises[streamPartId].promise.cancel();
            }
            delete this.ongoingPromises[streamPartId];
        });
        this.ongoingPromises = {};
        this.stopped = true;
    }
    async invokeHandleFnWithLock(streamPartId) {
        if (this.stopped) {
            return;
        }
        if (!this.queue[streamPartId]) {
            if (this.ongoingPromises[streamPartId]) {
                this.ongoingPromises[streamPartId].handling = false;
            }
            return;
        }
        this.ongoingPromises[streamPartId].handling = true;
        const { instructionMessage, trackerId } = this.queue[streamPartId];
        delete this.queue[streamPartId];
        try {
            this.ongoingPromises[streamPartId].promise = (0, cancelable_promise_1.cancelable)(this.handleFn(instructionMessage, trackerId));
            await this.ongoingPromises[streamPartId].promise;
        }
        catch (err) {
            logger.warn('Encountered error handling instruction', err);
        }
        finally {
            this.invokeHandleFnWithLock(streamPartId);
        }
    }
}
exports.InstructionThrottler = InstructionThrottler;
//# sourceMappingURL=InstructionThrottler.js.map