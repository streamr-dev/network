import { InstructionMessage, StreamPartID } from '@streamr/protocol'
import { cancelable, CancelablePromise } from 'cancelable-promise'
import { Logger } from "@streamr/utils"
import { TrackerId } from '../identifiers'

type Queue = Record<StreamPartID, {
    instructionMessage: InstructionMessage
    trackerId: TrackerId
}>

type HandleFn = (instructionMessage: InstructionMessage, trackerId: TrackerId) => Promise<void>

const logger = new Logger(module)

/**
 * InstructionThrottler makes sure that
 *  1. no more than one instruction is handled at a time
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per stream part is kept in queue.
 */
export class InstructionThrottler {
    private readonly handleFn: HandleFn
    private queue: Queue = {}
    private instructionCounter: Record<StreamPartID, number> = {}
    private ongoingPromises: Record<StreamPartID, {
        promise: CancelablePromise<void> | null
        handling: boolean
    }>
    private stopped: boolean

    constructor(handleFn: HandleFn) {
        this.handleFn = handleFn
        this.ongoingPromises = {}
        this.stopped = false
    }

    add(instructionMessage: InstructionMessage, trackerId: TrackerId): void {
        if (this.stopped) {
            return
        }
        const streamPartId = instructionMessage.getStreamPartID()
        if (!this.instructionCounter[streamPartId] || this.instructionCounter[streamPartId] <= instructionMessage.counter) {
            this.instructionCounter[streamPartId] = instructionMessage.counter
            this.queue[streamPartId] = {
                instructionMessage,
                trackerId
            }

            if (!this.ongoingPromises[streamPartId]) {
                this.ongoingPromises[streamPartId] = {
                    promise: null,
                    handling: false
                }
            }
            if (!this.ongoingPromises[streamPartId].handling) {
                this.invokeHandleFnWithLock(streamPartId).catch((err) => {
                    logger.warn('Failed to handle instruction', err)
                })
            }
        }
    }

    removeStreamPart(streamPartId: StreamPartID): void {
        if (this.stopped) {
            return
        }
        delete this.queue[streamPartId]
        delete this.instructionCounter[streamPartId]
        if (this.ongoingPromises[streamPartId]) {
            this.ongoingPromises[streamPartId].promise!.cancel()
        }
        delete this.ongoingPromises[streamPartId]
    }

    isIdle(): boolean {
        return !Object.values(this.ongoingPromises).some((p) => p.handling)
    }

    stop(): void {
        this.queue = {}
        this.instructionCounter = {}
        ;(Object.keys(this.ongoingPromises) as StreamPartID[]).forEach((streamPartId) => {
            if (this.ongoingPromises[streamPartId]) {
                this.ongoingPromises[streamPartId].promise!.cancel()
            }
            delete this.ongoingPromises[streamPartId]
        })
        this.ongoingPromises = {}
        this.stopped = true
    }

    private async invokeHandleFnWithLock(streamPartId: StreamPartID): Promise<void> {
        if (this.stopped) {
            return
        }
        if (!this.queue[streamPartId]) {
            if (this.ongoingPromises[streamPartId]) {
                this.ongoingPromises[streamPartId].handling = false
            }
            return
        }
        this.ongoingPromises[streamPartId].handling = true

        const { instructionMessage, trackerId } = this.queue[streamPartId]
        delete this.queue[streamPartId]

        try {
            this.ongoingPromises[streamPartId].promise = cancelable(this.handleFn(instructionMessage, trackerId))
            await this.ongoingPromises[streamPartId].promise
        } catch (err) {
            logger.warn('Encountered error handling instruction', err)
        } finally {
            this.invokeHandleFnWithLock(streamPartId)
        }
    }
}
