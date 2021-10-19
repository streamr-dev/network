import { SPID, SPIDKey } from 'streamr-client-protocol'
import { Status } from '../../identifiers'
import { NodeId } from '../node/Node'

export const COUNTER_UNSUBSCRIBE = -1

type Counters = Record<NodeId,Record<SPIDKey,number>>

export class InstructionCounter {
    private readonly counters: Counters = {}

    constructor() {}

    setOrIncrement(nodeId: NodeId, spidKey: SPIDKey): number {
        this.getAndSetIfNecessary(nodeId, spidKey)
        this.counters[nodeId][spidKey] += 1
        return this.counters[nodeId][spidKey]
    }

    isMostRecent(status: Status, source: NodeId): boolean {
        const spidKey = SPID.toKey(status.stream.id, status.stream.partition)
        const currentCounter = this.getAndSetIfNecessary(source, spidKey)
        return (status.stream.counter >= currentCounter || status.stream.counter === COUNTER_UNSUBSCRIBE)
    }

    removeNode(nodeId: NodeId): void {
        delete this.counters[nodeId]
    }

    removeStream(spidKey: SPIDKey): void {
        Object.keys(this.counters).forEach((nodeId) => {
            delete this.counters[nodeId][spidKey]
        })
    }

    private getAndSetIfNecessary(nodeId: NodeId, spidKey: SPIDKey): number {
        if (this.counters[nodeId] === undefined) {
            this.counters[nodeId] = {}
        }
        if (this.counters[nodeId][spidKey] === undefined) {
            this.counters[nodeId][spidKey] = 0
        }
        return this.counters[nodeId][spidKey]
    }
}
