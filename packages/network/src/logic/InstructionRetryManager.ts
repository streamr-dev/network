import { StreamIdAndPartition, StreamKey } from "../identifiers"
import { TrackerLayer } from "streamr-client-protocol"
import { Logger } from "../helpers/Logger"
import { TrackerId } from './Tracker'

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
    private instructionRetryIntervals: Record<StreamKey, {
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
        const id = StreamIdAndPartition.fromMessage(instructionMessage).key()
        if (this.instructionRetryIntervals[id]) {
            clearTimeout(this.instructionRetryIntervals[id].interval)
        }
        this.instructionRetryIntervals[id] = {
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
        const streamKey = StreamIdAndPartition.fromMessage(instructionMessage).key()
        try {
            // First and every nth instruction retries will always send status messages to tracker
            await this.handleFn(instructionMessage, trackerId, this.instructionRetryIntervals[streamKey].counter !== 0)
        } catch (err) {
            this.logger.warn('instruction retry threw %s', err)
        }
        // Check that stream has not been removed
        if (this.instructionRetryIntervals[streamKey]) {
            if (this.instructionRetryIntervals[streamKey].counter >= this.statusSendCounterLimit) {
                this.instructionRetryIntervals[streamKey].counter = 0
            } else {
                this.instructionRetryIntervals[streamKey].counter += 1
            }

            clearTimeout(this.instructionRetryIntervals[streamKey].interval)
            this.instructionRetryIntervals[streamKey].interval = setTimeout(() =>
                this.retryFunction(instructionMessage, trackerId)
            , this.intervalInMs)
        }
    }

    removeStream(streamKey: StreamKey): void {
        if (this.stopped) {
            return
        }
        if (streamKey in this.instructionRetryIntervals) {
            clearTimeout(this.instructionRetryIntervals[streamKey].interval)
            delete this.instructionRetryIntervals[streamKey]
            this.logger.debug('stream %s successfully removed', streamKey)
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
