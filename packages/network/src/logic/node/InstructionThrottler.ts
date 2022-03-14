import { StreamPartID } from 'streamr-client-protocol'
import { cancelable, CancelablePromiseType } from 'cancelable-promise'
import { TrackerLayer } from 'streamr-client-protocol'
import { Logger } from "../../helpers/Logger"
import { TrackerId } from '../tracker/Tracker'

type Queue = Record<StreamPartID, {
    instructionMessage: TrackerLayer.InstructionMessage
    trackerId: TrackerId
}>

type HandleFn = (instructionMessage: TrackerLayer.InstructionMessage, trackerId: TrackerId) => Promise<void>

/**
 * InstructionThrottler makes sure that
 *  1. no more than one instruction is handled at a time
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per stream part is kept in queue.
 */
export class InstructionThrottler {
    private readonly logger: Logger
    private readonly handleFn: HandleFn
    private queue: Queue = {}
    private instructionCounter: Record<StreamPartID,number> = {}
    private ongoingPromises: Record<StreamPartID, {
        promise: CancelablePromiseType<void> | null
        handling: boolean
    }>
    private stopped: boolean

    constructor(handleFn: HandleFn) {
        this.logger = new Logger(module)
        this.handleFn = handleFn
        this.ongoingPromises = {}
        this.stopped = false
    }

    add(instructionMessage: TrackerLayer.InstructionMessage, trackerId: TrackerId): void {
        if (this.stopped) {
            return
        }
        const streamPartId = instructionMessage.getStreamPartID()
        if (!this.instructionCounter[streamPartId] || this.instructionCounter[streamPartId] <= instructionMessage.counter) {
            this.logger.info('Received NEW instruction %d (current=%s)',
                instructionMessage.counter, this.instructionCounter[streamPartId])
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
                    this.logger.warn("error handling instruction, reason: %s", err)
                })
            }
        } else {
            this.logger.warn('Received OLD instruction %d (current=%s)',
                instructionMessage.counter, this.instructionCounter[streamPartId])
        }
    }

    removeStreamPart(streamPartId: StreamPartID): void {
        if (this.stopped) {
            return
        }
        this.logger.info('Remove streamPart %s', streamPartId)
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
            this.logger.warn('handling InstructionMessage threw, error %j', err)
        } finally {
            this.invokeHandleFnWithLock(streamPartId)
        }
    }
}
