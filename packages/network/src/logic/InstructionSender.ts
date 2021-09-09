import _ from 'lodash'
import { Logger } from '../helpers/Logger'
import { Metrics } from '../helpers/MetricsContext'
import { StreamIdAndPartition, StreamKey } from '../identifiers'
import { TrackerServer } from '../protocol/TrackerServer'
import { NodeId } from './Node'
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

const DEFAULT_TOPOLOGY_STABILIZATION: TopologyStabilizationOptions = {
    debounceWait: 100,
    maxWait: 2000
}

const logger = new Logger(module)

export interface Instruction {
    nodeId: NodeId,
    streamKey: StreamKey,
    newNeighbors: NodeId[],
    counterValue: number
}

class StreamInstructionBuffer {
    private instructions: Map<NodeId,Instruction> = new Map()
    private debouncedOnReady: () => void

    constructor(topologyStabilization: TopologyStabilizationOptions, onReady: () => void) {
        this.debouncedOnReady = _.debounce(onReady, topologyStabilization.debounceWait, {
            maxWait: topologyStabilization.maxWait
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
}

export class InstructionSender {

    private readonly streamBuffers: Map<StreamKey,StreamInstructionBuffer> = new Map()
    private readonly topologyStabilization: TopologyStabilizationOptions
    private readonly trackerServer: TrackerServer
    private readonly metrics: Metrics

    constructor(topologyStabilization: TopologyStabilizationOptions|undefined, trackerServer: TrackerServer, metrics: Metrics) {
        this.topologyStabilization = topologyStabilization ?? DEFAULT_TOPOLOGY_STABILIZATION
        this.trackerServer = trackerServer
        this.metrics = metrics
    }

    addInstruction(instruction: Instruction) {
        this.getOrCreateBuffer(instruction.streamKey).addInstruction(instruction)
    }

    getOrCreateBuffer(streamKey: StreamKey) {
        const existingBuffer = this.streamBuffers.get(streamKey)
        if (existingBuffer !== undefined) {
            return existingBuffer
        } else {
            const newBuffer = new StreamInstructionBuffer(this.topologyStabilization, () => {
                this.streamBuffers.delete(streamKey)
                this.sendInstructions(newBuffer)
            })
            this.streamBuffers.set(streamKey, newBuffer)
            return newBuffer
        }
    }

    private async sendInstructions(buffer: StreamInstructionBuffer) {
        for (const instruction of buffer!.getInstructions()) {
            const { nodeId, streamKey, newNeighbors, counterValue } = instruction
            this.metrics.record('instructionsSent', 1)
            try {
                await this.trackerServer.sendInstruction(
                    nodeId,
                    StreamIdAndPartition.fromKey(streamKey),
                    newNeighbors,
                    counterValue
                )
                logger.debug('Instruction %o sent to node %o', newNeighbors, { counterValue, streamKey, nodeId })
            } catch (err) {
                logger.error(`Failed to send instructions %o to node %o, reason: %s`, newNeighbors, { counterValue, streamKey, nodeId }, err)
            }
        }
    }
}