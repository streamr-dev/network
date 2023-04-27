import debounce from 'lodash/debounce'
import type { DebouncedFunc } from 'lodash'
import { StreamPartID } from '@streamr/protocol'
import { NodeId } from '@streamr/network-node'
import { Logger, MetricsContext, MetricsDefinition, Metric, RateMetric } from '@streamr/utils'
import { TopologyStabilizationOptions } from './Tracker'

/**
 * Instructions and status acks, i.e. "entries", are collected to buffers and sent
 * after a short delay. For each stream part there is a separate buffer.
 *
 * We use debouncing to delay the sending. It means that we send the buffered entries
 * when either of these conditions is satisfied:
 * - the topology stabilizes: no new entries have been added to the stream part in X milliseconds
 * - the buffer times out: we have buffered an entry for Y milliseconds
 *
 * When an entry is added to the buffer, it may overwrite an existing entry in the buffer if
 * both entries share the same nodeId. In that situation we expect that the previous entry
 * is no longer valid and can be ignored.
 */

const DEFAULT_TOPOLOGY_STABILIZATION_OPTIONS: TopologyStabilizationOptions = {
    debounceWait: 100,
    maxWait: 2000
}

const logger = new Logger(module)

export interface Instruction {
    nodeId: NodeId
    streamPartId: StreamPartID
    newNeighbors: NodeId[]
    counterValue: number
}

export interface StatusAck {
    nodeId: NodeId
    streamPartId: StreamPartID
}

function isInstruction(entry: Instruction | StatusAck): entry is Instruction {
    return (entry as any).counterValue !== undefined
}

class Buffer {
    private readonly entries = new Map<NodeId, Instruction | StatusAck>()
    private readonly debouncedOnReady: DebouncedFunc<() => void>

    constructor(options: TopologyStabilizationOptions, onReady: () => void) {
        this.debouncedOnReady = debounce(onReady, options.debounceWait, {
            maxWait: options.maxWait
        })
    }

    add(entry: Instruction | StatusAck) {
        // may overwrite an earlier entry for the same node
        this.entries.set(entry.nodeId, entry)
        this.debouncedOnReady()
    }

    getAll(): IterableIterator<Instruction | StatusAck> {
        return this.entries.values()
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

export type SendStatusAckFn = (
    receiverNodeId: NodeId,
    streamPartId: StreamPartID
) => Promise<void>

interface Metrics extends MetricsDefinition {
    instructionSent: Metric
}

export class InstructionAndStatusAckSender {
    private readonly streamPartBuffers = new Map<StreamPartID, Buffer>()
    private readonly options: TopologyStabilizationOptions
    private readonly sendInstruction: SendInstructionFn
    private readonly sendStatusAck: SendStatusAckFn
    private readonly metrics: Metrics

    constructor(
        options: TopologyStabilizationOptions | undefined,
        sendInstruction: SendInstructionFn,
        sendStatusAck: SendStatusAckFn,
        metricsContext: MetricsContext
    ) {
        this.options = options ?? DEFAULT_TOPOLOGY_STABILIZATION_OPTIONS
        this.sendInstruction = sendInstruction
        this.sendStatusAck = sendStatusAck
        this.metrics = {
            instructionSent: new RateMetric()
        }
        metricsContext.addMetrics('tracker', this.metrics)
    }

    addInstruction(instruction: Instruction): void {
        this.getOrCreateBuffer(instruction.streamPartId).add(instruction)
    }

    addStatusAck(statusAck: StatusAck): void {
        this.getOrCreateBuffer(statusAck.streamPartId).add(statusAck)
    }

    stop(): void {
        this.streamPartBuffers.forEach((entry) => entry.stop())
    }

    private getOrCreateBuffer(streamPartId: StreamPartID): Buffer {
        const existingBuffer = this.streamPartBuffers.get(streamPartId)
        if (existingBuffer !== undefined) {
            return existingBuffer
        }
        const newBuffer = new Buffer(this.options, () => {
            this.streamPartBuffers.get(streamPartId)?.stop()
            this.streamPartBuffers.delete(streamPartId)
            this.sendInstructions(newBuffer)
        })
        this.streamPartBuffers.set(streamPartId, newBuffer)
        return newBuffer

    }

    private async sendInstructions(buffer: Buffer): Promise<void> {
        const promises = Array.from(buffer.getAll())
            .map(async (entry) => {
                this.metrics.instructionSent.record(1)
                try {
                    if (isInstruction(entry)) {
                        const { nodeId, streamPartId, newNeighbors, counterValue } = entry
                        await this.sendInstruction(nodeId, streamPartId, newNeighbors, counterValue)
                        logger.debug('Sent instruction', {
                            newNeighbors,
                            counterValue,
                            nodeId,
                            streamPartId
                        })
                    } else {
                        const { nodeId, streamPartId } = entry
                        await this.sendStatusAck(nodeId, streamPartId)
                        logger.debug('Sent status ack', {
                            nodeId,
                            streamPartId
                        })
                    }
                } catch (err) {
                    logger.warn('Failed to send instructions or ack', {
                        entry,
                        err
                    })
                }
            })
        await Promise.allSettled(promises)
    }
}
