import { cancelable, CancelablePromiseType } from 'cancelable-promise'
import { StreamIdAndPartition, StreamKey } from '../../identifiers'
import { TrackerLayer } from 'streamr-client-protocol'
import { Logger } from "../../helpers/Logger"
import { TrackerId } from '../tracker/Tracker'

type Queue = Record<StreamKey, {
    instructionMessage: TrackerLayer.InstructionMessage
    trackerId: TrackerId
}>

type HandleFn = (instructionMessage: TrackerLayer.InstructionMessage, trackerId: TrackerId) => Promise<void>

/**
 * InstructionThrottler makes sure that
 *  1. no more than one instruction is handled at a time
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per streamKey is kept in queue.
 */
export class InstructionThrottler {
    private readonly logger: Logger
    private readonly handleFn: HandleFn
    private queue: Queue = {}
    private instructionCounter: Record<StreamKey,number> = {} // streamKey => counter
    private ongoingPromises: Record<StreamKey, {
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
        const streamKey = StreamIdAndPartition.fromMessage(instructionMessage).key()
        if (!this.instructionCounter[streamKey] || this.instructionCounter[streamKey] <= instructionMessage.counter) {
            this.instructionCounter[streamKey] = instructionMessage.counter
            this.queue[StreamIdAndPartition.fromMessage(instructionMessage).key()] = {
                instructionMessage,
                trackerId
            }

            if (!this.ongoingPromises[streamKey]) {
                this.ongoingPromises[streamKey] = {
                    promise: null,
                    handling: false
                }
            }
            if (!this.ongoingPromises[streamKey].handling) {
                this.invokeHandleFnWithLock(streamKey).catch((err) => {
                    this.logger.warn("error handling instruction, reason: %s", err)
                })
            }
        }
    }

    removeStream(streamKey: StreamKey): void {
        if (this.stopped) {
            return
        }
        delete this.queue[streamKey]
        delete this.instructionCounter[streamKey]
        if (this.ongoingPromises[streamKey]) {
            this.ongoingPromises[streamKey].promise!.cancel()
        }
        delete this.ongoingPromises[streamKey]
    }

    isIdle(): boolean {
        return !Object.values(this.ongoingPromises).some((p) => p.handling)
    }

    stop(): void {
        this.queue = {}
        this.instructionCounter = {}
        Object.keys(this.ongoingPromises).forEach((streamKey) => {
            if (this.ongoingPromises[streamKey]) {
                this.ongoingPromises[streamKey].promise!.cancel()
            }
            delete this.ongoingPromises[streamKey]
        })
        this.ongoingPromises = {}
        this.stopped = true
    }

    private async invokeHandleFnWithLock(streamKey: StreamKey): Promise<void> {
        if (this.stopped) {
            return
        }
        if (!this.queue[streamKey]) {
            if (this.ongoingPromises[streamKey]) {
                this.ongoingPromises[streamKey].handling = false
            }
            return
        }
        this.ongoingPromises[streamKey].handling = true

        const { instructionMessage, trackerId } = this.queue[streamKey]
        delete this.queue[streamKey]

        try {
            this.ongoingPromises[streamKey].promise = cancelable(this.handleFn(instructionMessage, trackerId))
            await this.ongoingPromises[streamKey].promise
        } catch (err) {
            this.logger.warn('handling InstructionMessage threw, error %j', err)
        } finally {
            this.invokeHandleFnWithLock(streamKey)
        }
    }
}
