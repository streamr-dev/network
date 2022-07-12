import { StreamPartID, InstructionMessage } from "streamr-client-protocol"
import { Logger } from "@streamr/utils"
import { TrackerId } from '../identifiers'

type HandleFn = (
    instructionMessage: InstructionMessage,
    trackerId: TrackerId,
    reattempt: boolean
) => Promise<void>

export class InstructionRetryManager {
    private readonly logger: Logger
    private readonly handleFn: HandleFn
    private readonly intervalInMs: number
    private readonly statusSendCounterLimit: number
    private instructionRetryIntervals: Record<StreamPartID, {
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

    add(instructionMessage: InstructionMessage, trackerId: TrackerId): void {
        if (this.stopped) {
            return
        }
        const streamPartId = instructionMessage.getStreamPartID()
        if (this.instructionRetryIntervals[streamPartId]) {
            clearTimeout(this.instructionRetryIntervals[streamPartId].interval)
        }
        this.instructionRetryIntervals[streamPartId] = {
            interval: setTimeout(() =>
                this.retryFunction(instructionMessage, trackerId)
            , this.intervalInMs),
            counter: 0
        }
    }

    async retryFunction(instructionMessage: InstructionMessage, trackerId: TrackerId): Promise<void> {
        if (this.stopped) {
            return
        }
        const streamPartId = instructionMessage.getStreamPartID()
        try {
            // First and every nth instruction retries will always send status messages to tracker
            await this.handleFn(instructionMessage, trackerId, this.instructionRetryIntervals[streamPartId].counter !== 0)
        } catch (err) {
            this.logger.warn('instruction retry threw %s', err)
        }
        // Check that stream has not been removed
        if (this.instructionRetryIntervals[streamPartId]) {
            if (this.instructionRetryIntervals[streamPartId].counter >= this.statusSendCounterLimit) {
                this.instructionRetryIntervals[streamPartId].counter = 0
            } else {
                this.instructionRetryIntervals[streamPartId].counter += 1
            }

            clearTimeout(this.instructionRetryIntervals[streamPartId].interval)
            this.instructionRetryIntervals[streamPartId].interval = setTimeout(() =>
                this.retryFunction(instructionMessage, trackerId)
            , this.intervalInMs)
        }
    }

    removeStreamPart(streamPartId: StreamPartID): void {
        if (this.stopped) {
            return
        }
        if (streamPartId in this.instructionRetryIntervals) {
            clearTimeout(this.instructionRetryIntervals[streamPartId].interval)
            delete this.instructionRetryIntervals[streamPartId]
            this.logger.debug('stream part %s successfully removed', streamPartId)
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
