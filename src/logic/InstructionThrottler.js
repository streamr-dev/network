const logger = require('../helpers/logger')('streamr:InstructionThrottler')
const { StreamIdAndPartition } = require('../identifiers')
/**
 * InstructionThrottler makes sure that
 *  1. only 100 instructions are handled per second
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per streamId is kept in queue.
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

module.exports = class InstructionThrottler {
    constructor(handleFn) {
        this.handling = false
        this.handleFn = handleFn
        this.queue = {} // streamId => instructionMessage
    }

    add(instructionMessage, trackerId) {
        this.queue[StreamIdAndPartition.fromMessage(instructionMessage)] = {
            instructionMessage,
            trackerId
        }
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

    reset() {
        this.queue = {}
    }

    async _invokeHandleFnWithLock() {
        const streamIds = Object.keys(this.queue)
        if (streamIds.length > 0) {
            const streamId = streamIds[0]
            const { instructionMessage, trackerId } = this.queue[streamId]
            delete this.queue[streamId]

            this.handling = true
            await wait(10)
            if (this._isQueueEmpty()) {
                this.handling = false
            }
            this.handleFn(instructionMessage, trackerId)

            this._invokeHandleFnWithLock()
        }
    }

    _isQueueEmpty() {
        return Object.keys(this.queue).length === 0
    }
}
