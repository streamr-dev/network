import { SPIDKey } from 'streamr-client-protocol'
import { cancelable, CancelablePromiseType } from 'cancelable-promise'
import { TrackerLayer } from 'streamr-client-protocol'
import { Logger } from "../../helpers/Logger"
import { TrackerId } from '../tracker/Tracker'

type Queue = Record<SPIDKey, {
    instructionMessage: TrackerLayer.InstructionMessage
    trackerId: TrackerId
}>

type HandleFn = (instructionMessage: TrackerLayer.InstructionMessage, trackerId: TrackerId) => Promise<void>

/**
 * InstructionThrottler makes sure that
 *  1. no more than one instruction is handled at a time
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per spidKey is kept in queue.
 */
export class InstructionThrottler {
    private readonly logger: Logger
    private readonly handleFn: HandleFn
    private queue: Queue = {}
    private instructionCounter: Record<SPIDKey,number> = {} // spidKey => counter
    private ongoingPromises: Record<SPIDKey, {
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
        const spidKey = instructionMessage.getSPID().toKey()
        if (!this.instructionCounter[spidKey] || this.instructionCounter[spidKey] <= instructionMessage.counter) {
            this.instructionCounter[spidKey] = instructionMessage.counter
            this.queue[spidKey] = {
                instructionMessage,
                trackerId
            }

            if (!this.ongoingPromises[spidKey]) {
                this.ongoingPromises[spidKey] = {
                    promise: null,
                    handling: false
                }
            }
            if (!this.ongoingPromises[spidKey].handling) {
                this.invokeHandleFnWithLock(spidKey).catch((err) => {
                    this.logger.warn("error handling instruction, reason: %s", err)
                })
            }
        }
    }

    removeStream(spidKey: SPIDKey): void {
        if (this.stopped) {
            return
        }
        delete this.queue[spidKey]
        delete this.instructionCounter[spidKey]
        if (this.ongoingPromises[spidKey]) {
            this.ongoingPromises[spidKey].promise!.cancel()
        }
        delete this.ongoingPromises[spidKey]
    }

    isIdle(): boolean {
        return !Object.values(this.ongoingPromises).some((p) => p.handling)
    }

    stop(): void {
        this.queue = {}
        this.instructionCounter = {}
        Object.keys(this.ongoingPromises).forEach((spidKey) => {
            if (this.ongoingPromises[spidKey]) {
                this.ongoingPromises[spidKey].promise!.cancel()
            }
            delete this.ongoingPromises[spidKey]
        })
        this.ongoingPromises = {}
        this.stopped = true
    }

    private async invokeHandleFnWithLock(spidKey: SPIDKey): Promise<void> {
        if (this.stopped) {
            return
        }
        if (!this.queue[spidKey]) {
            if (this.ongoingPromises[spidKey]) {
                this.ongoingPromises[spidKey].handling = false
            }
            return
        }
        this.ongoingPromises[spidKey].handling = true

        const { instructionMessage, trackerId } = this.queue[spidKey]
        delete this.queue[spidKey]

        try {
            this.ongoingPromises[spidKey].promise = cancelable(this.handleFn(instructionMessage, trackerId))
            await this.ongoingPromises[spidKey].promise
        } catch (err) {
            this.logger.warn('handling InstructionMessage threw, error %j', err)
        } finally {
            this.invokeHandleFnWithLock(spidKey)
        }
    }
}
