import { StreamIdAndPartition, StreamKey } from "../identifiers"
import { TrackerLayer } from "streamr-client-protocol"
import getLogger from "../helpers/logger"

const logger = getLogger('streamr:logic:InstructionThrottler')

interface Queue {
    [key: string]: {
        instructionMessage: TrackerLayer.InstructionMessage
        trackerId: string
    }
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * InstructionThrottler makes sure that
 *  1. only 100 instructions are handled per second
 *  2. any new instructions arriving while an instruction is being handled are queued in a
 *     way where only the most latest instruction per streamId is kept in queue.
 */
export class InstructionThrottler {
    private readonly handleFn: (instructionMessage: TrackerLayer.InstructionMessage, trackerId: string) => Promise<void>
    private queue: Queue = {} // streamId => instructionMessage
    private handling: boolean = false

    constructor(handleFn: (instructionMessage: TrackerLayer.InstructionMessage, trackerId: string) => Promise<void>) {
        this.handleFn = handleFn
    }

    add(instructionMessage: TrackerLayer.InstructionMessage, trackerId: string): void {
        this.queue[StreamIdAndPartition.fromMessage(instructionMessage).key()] = {
            instructionMessage,
            trackerId
        }
        if (!this.handling) {
            this.invokeHandleFnWithLock().catch((err) => {
                logger.warn("Error handling instruction %s", err)
            })
        }
    }

    removeStreamId(streamId: StreamKey): void {
        delete this.queue[streamId]
    }

    isIdle(): boolean {
        return !this.handling
    }

    reset(): void {
        this.queue = {}
    }

    private async invokeHandleFnWithLock(): Promise<void> {
        const streamIds = Object.keys(this.queue)
        if (streamIds.length > 0) {
            const streamId: StreamKey = streamIds[0]
            const { instructionMessage, trackerId } = this.queue[streamId]
            delete this.queue[streamId]

            this.handling = true
            await wait(10)
            if (this.isQueueEmpty()) {
                this.handling = false
            }
            this.handleFn(instructionMessage, trackerId).catch((err) => {
                logger.warn("Error handling instruction %s", err)
            })

            this.invokeHandleFnWithLock().catch((err) => {
                logger.warn("Error handling instruction %s", err)
            })
        }
    }

    private isQueueEmpty(): boolean {
        return Object.keys(this.queue).length === 0
    }
}
