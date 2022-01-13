import _ from 'lodash'
import { StreamPartID } from 'streamr-client-protocol'
import { Logger } from '../../helpers/Logger'
import { Metrics } from '../../helpers/MetricsContext'
import { NodeId } from '../node/Node'
import { TopologyStabilizationOptions } from './Tracker'

/**
 * Instructions are collected to buffers and sent after a short delay. For each stream
 * there is a separate buffer.
 * 
 * We use debouncing to delay the sending. It means that we send the buffered instructions 
 * when either of these conditions is satisfied: 
 * - the topology stabilizes: no new instructions has been formed for the stream in 
 *   X milliseconds
 * - the buffer times out: we have buffered an instruction for Y milliseconds
 * 
 * When an instruction is added to a stream buffer, it may overwrite an existing
 * instruction in the buffer if the both instructions share the same nodeId. In that 
 * situation we expect that the previous instruction is no longer valid (it has a lower
 * counterValue) and can be ignored.
 */

const DEFAULT_TOPOLOGY_STABILIZATION_OPTIONS: TopologyStabilizationOptions = {
    debounceWait: 100,
    maxWait: 2000
}

const logger = new Logger(module)

export interface Instruction {
    nodeId: NodeId,
    streamPartId: StreamPartID,
    newNeighbors: NodeId[],
    counterValue: number
}

class StreamInstructionBuffer {
    private readonly instructions = new Map<NodeId, Instruction>()
    private readonly debouncedOnReady: _.DebouncedFunc<() => void>

    constructor(options: TopologyStabilizationOptions, onReady: () => void) {
        this.debouncedOnReady = _.debounce(onReady, options.debounceWait, {
            maxWait: options.maxWait
        })
    }

    addInstruction(instruction: Instruction) {
        // may overwrite an earlier instruction for the same node
        this.instructions.set(instruction.nodeId, instruction)
        this.debouncedOnReady()
    }

    getInstructions(): IterableIterator<Instruction> {
        return this.instructions.values()
    }

    stop(): void {
        this.debouncedOnReady.cancel()
    }
}

export type SendInstructionFn = (
    receiverNodeId: NodeId,
    streamPartId: StreamPartID,
    nodeIds: NodeId[],
    counter: number
) => Promise<void>

export class InstructionSender {
    private readonly streamBuffers = new Map<StreamPartID, StreamInstructionBuffer>()
    private readonly options: TopologyStabilizationOptions
    private readonly sendInstruction: SendInstructionFn
    private readonly metrics: Metrics

    constructor(
        options: TopologyStabilizationOptions | undefined,
        sendInstruction: SendInstructionFn,
        metrics: Metrics
    ) {
        this.options = options ?? DEFAULT_TOPOLOGY_STABILIZATION_OPTIONS
        this.sendInstruction = sendInstruction
        this.metrics = metrics
            .addRecordedMetric('instructionsSent')
    }

    addInstruction(instruction: Instruction): void {
        this.getOrCreateBuffer(instruction.streamPartId).addInstruction(instruction)
    }

    stop(): void {
        this.streamBuffers.forEach((entry) => entry.stop())
    }

    private getOrCreateBuffer(streamPartId: StreamPartID): StreamInstructionBuffer {
        const existingBuffer = this.streamBuffers.get(streamPartId)
        if (existingBuffer !== undefined) {
            return existingBuffer
        } else {
            const newBuffer = new StreamInstructionBuffer(this.options, () => {
                this.streamBuffers.get(streamPartId)?.stop()
                this.streamBuffers.delete(streamPartId)
                this.sendInstructions(newBuffer)
            })
            this.streamBuffers.set(streamPartId, newBuffer)
            return newBuffer
        }
    }

    private async sendInstructions(buffer: StreamInstructionBuffer): Promise<void> {
        const promises = Array.from(buffer.getInstructions())
            .map(async ({ nodeId, streamPartId, newNeighbors, counterValue }) => {
                this.metrics.record('instructionsSent', 1)
                try {
                    await this.sendInstruction(
                        nodeId,
                        streamPartId,
                        newNeighbors,
                        counterValue
                    )
                    logger.debug('instruction %o sent to node %o', newNeighbors, { counterValue, streamPartId, nodeId })
                } catch (err) {
                    logger.error(`failed to send instructions %o to node %o, reason: %s`,
                        newNeighbors,
                        { counterValue, streamPartId, nodeId },
                        err
                    )
                }
            })
        await Promise.allSettled(promises)
    }
}