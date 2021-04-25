import { StreamIdAndPartition, StreamKey } from "../identifiers"
import { TrackerLayer } from "streamr-client-protocol"
import { Logger } from "../helpers/Logger"

type HandleFn = (
    instructionMessage: TrackerLayer.InstructionMessage,
    trackerId: string,
    reattempt: boolean
) => Promise<void>

export class InstructionRetryManager {
    private readonly logger: Logger
    private readonly handleFn: HandleFn
    private readonly intervalInMs: number
    private readonly statusSendCounterLimit: number
    private instructionRetryIntervals: { [key: string]: {
        interval: NodeJS.Timeout,
        counter: number,
        }
    }

    constructor(parentLogger: Logger, handleFn: HandleFn, intervalInMs: number) {
        this.logger = parentLogger.createChildLogger(['InstructionRetryManager'])
        this.handleFn = handleFn
        this.intervalInMs = intervalInMs
        this.instructionRetryIntervals = {}
        this.statusSendCounterLimit = 9
    }

    add(instructionMessage: TrackerLayer.InstructionMessage, trackerId: string): void {
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

    async retryFunction(instructionMessage: TrackerLayer.InstructionMessage, trackerId: string): Promise<void> {
        const streamId = StreamIdAndPartition.fromMessage(instructionMessage).key()
        try {
            // First and every nth instruction retries will always send status messages to tracker
            await this.handleFn(instructionMessage, trackerId, this.instructionRetryIntervals[streamId].counter !== 0)
        } catch (err) {
            this.logger.warn('instruction retry threw %s', err)
        }
        // Check that stream has not been removed
        if (this.instructionRetryIntervals[streamId]) {
            if (this.instructionRetryIntervals[streamId].counter >= this.statusSendCounterLimit) {
                this.instructionRetryIntervals[streamId].counter = 0
            } else {
                this.instructionRetryIntervals[streamId].counter += 1
            }

            clearTimeout(this.instructionRetryIntervals[streamId].interval)
            this.instructionRetryIntervals[streamId].interval = setTimeout(() =>
                this.retryFunction(instructionMessage, trackerId)
            , this.intervalInMs)
        }
    }

    removeStreamId(streamId: StreamKey): void {
        if (streamId in this.instructionRetryIntervals) {
            clearTimeout(this.instructionRetryIntervals[streamId].interval)
            delete this.instructionRetryIntervals[streamId]
            this.logger.debug('stream %s successfully removed', streamId)
        }
    }

    reset(): void {
        Object.values(this.instructionRetryIntervals).forEach((obj) => {
            clearTimeout(obj.interval)
            obj.counter = 0
        })
        this.instructionRetryIntervals = {}
    }
}
