const { cancelable } = require('cancelable-promise')

const logger = require('../helpers/logger')('streamr:InstructionThrottler')
const { StreamIdAndPartition } = require('../identifiers')
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
        this.ongoingPromise = null
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
        if (this.ongoingPromise) {
            this.ongoingPromise.cancel()
        }
    }

    async _invokeHandleFnWithLock() {
        const streamIds = Object.keys(this.queue)
        const streamId = streamIds[0]
        const { instructionMessage, trackerId } = this.queue[streamId]
        delete this.queue[streamId]

        this.handling = true
        try {
            this.ongoingPromise = cancelable(this.handleFn(instructionMessage, trackerId))
            await this.ongoingPromise
        } catch (err) {
            logger.warn('InstructionMessage handling threw error %s', err)
            logger.warn(err)
        } finally {
            this.ongoingPromise = null
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
