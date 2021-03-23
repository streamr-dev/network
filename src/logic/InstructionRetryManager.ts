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
    private instructionRetryIntervals: { [key: string]: NodeJS.Timeout }

    constructor(parentLogger: Logger, handleFn: HandleFn, intervalInMs: number) {
        this.logger = parentLogger.createChildLogger(['InstructionRetryManager'])
        this.handleFn = handleFn
        this.intervalInMs = intervalInMs
        this.instructionRetryIntervals = {}
    }

    add(instructionMessage: TrackerLayer.InstructionMessage, trackerId: string): void {
        const id = StreamIdAndPartition.fromMessage(instructionMessage).key()
        if (this.instructionRetryIntervals[id]) {
            clearTimeout(this.instructionRetryIntervals[id])
        }
        this.instructionRetryIntervals[id] = setTimeout(() =>
            this.retryFunction(instructionMessage, trackerId)
        , this.intervalInMs)
    }

    async retryFunction(instructionMessage: TrackerLayer.InstructionMessage, trackerId: string): Promise<void> {
        try {
            await this.handleFn(instructionMessage, trackerId, true)
        } catch (err) {
            this.logger.warn('instruction retry threw %s', err)
        }
        this.instructionRetryIntervals[StreamIdAndPartition.fromMessage(instructionMessage).key()] = setTimeout(() =>
            this.retryFunction(instructionMessage, trackerId)
        , this.intervalInMs)
    }

    removeStreamId(streamId: StreamKey): void {
        if (streamId in this.instructionRetryIntervals) {
            clearTimeout(this.instructionRetryIntervals[streamId])
            delete this.instructionRetryIntervals[streamId]
            this.logger.debug('stream %s successfully removed', streamId)
        }
    }

    reset(): void {
        Object.values(this.instructionRetryIntervals).forEach((timeout) => {
            clearTimeout(timeout)
        })
        this.instructionRetryIntervals = {}
    }
}
