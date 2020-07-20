/**
 * InstructionThrottler makes sure that
 *  1. no more than one instruction is handled at a time
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per streamId is kept in queue.
 */
module.exports = class InstructionThrottler {
    constructor(handleFn) {
        this.handling = false
        this.handleFn = handleFn
        this.queue = {} // streamId => instructionMessage
    }

    add(instructionMessage) {
        this.queue[instructionMessage.getStreamId()] = instructionMessage
        if (!this.handling) {
            this._invokeHandleFnWithLock()
        }
    }

    removeStreamId(streamId) {
        delete this.queue[streamId]
    }

    isIdle() {
        return !this.handling
    }

    async _invokeHandleFnWithLock() {
        const streamIds = Object.keys(this.queue)
        const streamId = streamIds[0]
        const instructionMessage = this.queue[streamId]
        delete this.queue[streamId]

        this.handling = true
        try {
            await this.handleFn(instructionMessage)
        } finally {
            if (this._isQueueEmpty()) {
                this.handling = false
            } else {
                this._invokeHandleFnWithLock()
            }
        }
    }

    _isQueueEmpty() {
        return Object.keys(this.queue).length === 0
    }
}
