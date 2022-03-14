import { StreamPartID, toStreamPartID } from 'streamr-client-protocol'
import { Status } from '../../identifiers'
import { NodeId } from '../node/Node'
import { Logger } from '../../helpers/logger/LoggerNode'

export const COUNTER_UNSUBSCRIBE = -1
// Used by the tracker to signal to nodes that they are alone in the topology
export const COUNTER_LONE_NODE = -2

const logger = new Logger(module)

type Counters = Record<NodeId, Record<StreamPartID, number>>

export class InstructionCounter {
    private readonly counters: Counters = {}

    constructor() {}

    setOrIncrement(nodeId: NodeId, streamPartId: StreamPartID): number {
        this.getAndSetIfNecessary(nodeId, streamPartId)
        this.counters[nodeId][streamPartId] += 1
        logger.info('counter (%s,%s) === %d',
            nodeId.slice(0, 15),
            streamPartId.slice(-15),
            this.counters[nodeId][streamPartId]
        )
        return this.counters[nodeId][streamPartId]
    }

    isMostRecent(status: Status, source: NodeId): boolean {
        const streamPartId = toStreamPartID(status.streamPart.id, status.streamPart.partition)
        const currentCounter = this.getAndSetIfNecessary(source, streamPartId)
        return (status.streamPart.counter >= currentCounter || status.streamPart.counter === COUNTER_UNSUBSCRIBE)
    }

    removeNode(nodeId: NodeId): void {
        logger.info('removeNode %s', nodeId.slice(0, 15))
        delete this.counters[nodeId]
    }

    removeNodeFromStreamPart(nodeId: NodeId, streamPartId: StreamPartID): void {
        if (this.counters[nodeId] !== undefined) {
            delete this.counters[nodeId][streamPartId]
        }
    }

    removeStreamPart(streamPartId: StreamPartID): void {
        Object.keys(this.counters).forEach((nodeId) => {
            logger.info('removeStreamPart: rm counter (%s,%s)',
                nodeId.slice(0, 15),
                streamPartId.slice(-15),
            )
            delete this.counters[nodeId][streamPartId]
        })
    }

    private getAndSetIfNecessary(nodeId: NodeId, streamPartId: StreamPartID): number {
        if (this.counters[nodeId] === undefined) {
            this.counters[nodeId] = {}
        }
        if (this.counters[nodeId][streamPartId] === undefined) {
            this.counters[nodeId][streamPartId] = 0
        }
        return this.counters[nodeId][streamPartId]
    }
}
