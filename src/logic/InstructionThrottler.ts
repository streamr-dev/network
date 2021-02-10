import { cancelable, CancelablePromiseType } from 'cancelable-promise'
import { StreamIdAndPartition, StreamKey } from '../identifiers'
import { TrackerLayer } from 'streamr-client-protocol'
import getLogger from '../helpers/logger'

const logger = getLogger('streamr:logic:InstructionThrottler')

interface Queue {
    [key: string]: {
        instructionMessage: TrackerLayer.InstructionMessage
        trackerId: string
    }
}

/**
 * InstructionThrottler makes sure that
 *  1. no more than one instruction is handled at a time
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per streamId is kept in queue.
 */
export class InstructionThrottler {
    private readonly handleFn: (instructionMessage: TrackerLayer.InstructionMessage, trackerId: string) => Promise<void>
    private queue: Queue = {} // streamId => instructionMessage
    private instructionCounter: { [key: string]: number } = {} // streamId => counter
    private ongoingPromises: {
        [key: string]: {
            promise: CancelablePromiseType<void> | null
            handling: boolean
        }
    }

    constructor(handleFn: (instructionMessage: TrackerLayer.InstructionMessage, trackerId: string) => Promise<void>) {
        this.handleFn = handleFn
        this.ongoingPromises = {}
    }

    add(instructionMessage: TrackerLayer.InstructionMessage, trackerId: string): void {
        const streamId = StreamIdAndPartition.fromMessage(instructionMessage).key()
        if (!this.instructionCounter[streamId] || this.instructionCounter[streamId] <= instructionMessage.counter) {
            this.instructionCounter[streamId] = instructionMessage.counter
            this.queue[StreamIdAndPartition.fromMessage(instructionMessage).key()] = {
                instructionMessage,
                trackerId
            }

            if (!this.ongoingPromises[streamId]) {
                this.ongoingPromises[streamId] = {
                    promise: null,
                    handling: false
                }
            }
            if (!this.ongoingPromises[streamId].handling) {
                this.invokeHandleFnWithLock(streamId).catch((err) => {
                    logger.warn("Error handling instruction %s", err)
                })
            }
        }
    }

    removeStreamId(streamId: StreamKey): void {
        delete this.queue[streamId]
        delete this.instructionCounter[streamId]
        if (this.ongoingPromises[streamId]) {
            this.ongoingPromises[streamId].promise!.cancel()
        }
        delete this.ongoingPromises[streamId]
    }

    isIdle(): boolean {
        return !Object.values(this.ongoingPromises).some((p) => p.handling)
    }

    reset(): void {
        this.queue = {}
        this.instructionCounter = {}
        Object.keys(this.ongoingPromises).forEach((streamId) => {
            if (this.ongoingPromises[streamId]) {
                this.ongoingPromises[streamId].promise!.cancel()
            }
            delete this.ongoingPromises[streamId]
        })
        this.ongoingPromises = {}
    }

    private async invokeHandleFnWithLock(streamId: string): Promise<void> {
        if (!this.queue[streamId]) {
            this.ongoingPromises[streamId].handling = false
            return
        }
        this.ongoingPromises[streamId].handling = true

        const { instructionMessage, trackerId } = this.queue[streamId]
        delete this.queue[streamId]

        try {
            this.ongoingPromises[streamId].promise = cancelable(this.handleFn(instructionMessage, trackerId))
            await this.ongoingPromises[streamId].promise
        } catch (err) {
            logger.warn('InstructionMessage handling threw error %s', err)
            logger.warn(err)
        } finally {
            this.invokeHandleFnWithLock(streamId)
        }
    }

    private isQueueEmpty(): boolean {
        return Object.keys(this.queue).length === 0
    }
}
