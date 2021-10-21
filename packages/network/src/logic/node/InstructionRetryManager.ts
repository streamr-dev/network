import { SPIDKey } from 'streamr-client-protocol'
import { TrackerLayer } from "streamr-client-protocol"
import { Logger } from "../../helpers/Logger"
import { TrackerId } from '../tracker/Tracker'

type HandleFn = (
    instructionMessage: TrackerLayer.InstructionMessage,
    trackerId: TrackerId,
    reattempt: boolean
) => Promise<void>

export class InstructionRetryManager {
    private readonly logger: Logger
    private readonly handleFn: HandleFn
    private readonly intervalInMs: number
    private readonly statusSendCounterLimit: number
    private instructionRetryIntervals: Record<SPIDKey, {
        interval: NodeJS.Timeout,
        counter: number,
    }>
    private stopped: boolean

    constructor(handleFn: HandleFn, intervalInMs: number) {
        this.logger = new Logger(module)
        this.handleFn = handleFn
        this.intervalInMs = intervalInMs
        this.instructionRetryIntervals = {}
        this.statusSendCounterLimit = 9
        this.stopped = false
    }

    add(instructionMessage: TrackerLayer.InstructionMessage, trackerId: TrackerId): void {
        if (this.stopped) {
            return
        }
        const spidKey = instructionMessage.getSPID().toKey()
        if (this.instructionRetryIntervals[spidKey]) {
            clearTimeout(this.instructionRetryIntervals[spidKey].interval)
        }
        this.instructionRetryIntervals[spidKey] = {
            interval: setTimeout(() =>
                this.retryFunction(instructionMessage, trackerId)
            , this.intervalInMs),
            counter: 0
        }
    }

    async retryFunction(instructionMessage: TrackerLayer.InstructionMessage, trackerId: TrackerId): Promise<void> {
        if (this.stopped) {
            return
        }
        const spidKey = instructionMessage.getSPID().toKey()
        try {
            // First and every nth instruction retries will always send status messages to tracker
            await this.handleFn(instructionMessage, trackerId, this.instructionRetryIntervals[spidKey].counter !== 0)
        } catch (err) {
            this.logger.warn('instruction retry threw %s', err)
        }
        // Check that stream partition has not been removed
        if (this.instructionRetryIntervals[spidKey]) {
            if (this.instructionRetryIntervals[spidKey].counter >= this.statusSendCounterLimit) {
                this.instructionRetryIntervals[spidKey].counter = 0
            } else {
                this.instructionRetryIntervals[spidKey].counter += 1
            }

            clearTimeout(this.instructionRetryIntervals[spidKey].interval)
            this.instructionRetryIntervals[spidKey].interval = setTimeout(() =>
                this.retryFunction(instructionMessage, trackerId)
            , this.intervalInMs)
        }
    }

    removeSPID(spidKey: SPIDKey): void {
        if (this.stopped) {
            return
        }
        if (spidKey in this.instructionRetryIntervals) {
            clearTimeout(this.instructionRetryIntervals[spidKey].interval)
            delete this.instructionRetryIntervals[spidKey]
            this.logger.debug('stream partition %s successfully removed', spidKey)
        }
    }

    stop(): void {
        Object.values(this.instructionRetryIntervals).forEach((obj) => {
            clearTimeout(obj.interval)
            obj.counter = 0
        })
        this.instructionRetryIntervals = {}
        this.stopped = true
    }
}
