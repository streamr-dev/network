import getLogger from '../helpers/logger'
import { StreamIdAndPartition, StreamKey } from "../identifiers"
import { TrackerLayer } from "streamr-client-protocol"

const logger = getLogger('streamr:logic:InstructionRetryManager')

export class InstructionRetryManager {
    private readonly handleFn: (instructionMessage: TrackerLayer.InstructionMessage, trackerId: string, reattempt: boolean) => Promise<void>
    private readonly intervalInMs: number
    private instructionRetryIntervals: { [key: string]: NodeJS.Timeout }

    constructor(handleFn: (instructionMessage: TrackerLayer.InstructionMessage, trackerId: string, reattempt: boolean) => Promise<void>, intervalInMs: number) {
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
            logger.warn('Instruction retry threw error', err)
        }
        this.instructionRetryIntervals[StreamIdAndPartition.fromMessage(instructionMessage).key()] = setTimeout(() =>
            this.retryFunction(instructionMessage, trackerId)
        , this.intervalInMs)
    }

    removeStreamId(streamId: StreamKey): void {
        if (streamId in this.instructionRetryIntervals) {
            clearTimeout(this.instructionRetryIntervals[streamId])
            delete this.instructionRetryIntervals[streamId]
            logger.debug('StreamId', streamId, 'successfully removed from InstructionRetryManager')
        }
    }

    reset(): void {
        Object.values(this.instructionRetryIntervals).forEach((timeout) => {
            clearTimeout(timeout)
        })
        this.instructionRetryIntervals = {}
    }
}
