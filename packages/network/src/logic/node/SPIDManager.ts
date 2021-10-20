import { MessageLayer, SPID, SPIDKey } from 'streamr-client-protocol'
import { StreamStatus } from '../../identifiers'
import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector'
import { NodeId } from './Node'
import { COUNTER_UNSUBSCRIBE } from '../tracker/InstructionCounter'
import _ from 'lodash'
import { transformIterable } from '../../helpers/transformIterable'

interface SPIDState {
    detectors: Map<string, DuplicateMessageDetector> // "publisherId-msgChainId" => DuplicateMessageDetector
    neighbors: Set<NodeId>
    counter: number
}

function keyForDetector({ publisherId, msgChainId }: MessageLayer.MessageID) {
    return `${publisherId}-${msgChainId}`
}

export class SPIDManager {
    private readonly states: Map<SPIDKey,SPIDState> = new Map<SPIDKey,SPIDState>()

    setUpSPID(spid: SPID): void {
        if (this.isSetUp(spid)) {
            throw new Error(`Stream partition ${spid} already set up`)
        }
        this.states.set(spid.toKey(), {
            detectors: new Map(),
            neighbors: new Set(),
            counter: 0
        })
    }

    markNumbersAndCheckThatIsNotDuplicate(
        messageId: MessageLayer.MessageID,
        previousMessageReference: MessageLayer.MessageRef | null
    ): boolean | never {
        const spid = SPID.from(messageId)
        this.verifyThatIsSetUp(spid)

        const detectorKey = keyForDetector(messageId)
        const { detectors } = this.states.get(spid.toKey())!
        if (!detectors.has(detectorKey)) {
            detectors.set(detectorKey, new DuplicateMessageDetector())
        }

        return detectors.get(detectorKey)!.markAndCheck(
            previousMessageReference === null
                ? null
                : new NumberPair(previousMessageReference.timestamp, previousMessageReference.sequenceNumber),
            new NumberPair(messageId.timestamp, messageId.sequenceNumber)
        )
    }

    updateCounter(spid: SPID, counter: number): void {
        this.states.get(spid.toKey())!.counter = counter
    }

    addNeighbor(spid: SPID, node: NodeId): void {
        this.verifyThatIsSetUp(spid)
        const { neighbors } = this.states.get(spid.toKey())!
        neighbors.add(node)
    }

    removeNeighbor(spid: SPID, node: NodeId): void {
        this.verifyThatIsSetUp(spid)
        const { neighbors } = this.states.get(spid.toKey())!
        neighbors.delete(node)
    }

    getSPIDStatus(spid: SPID): StreamStatus {
        const streamState = this.states.get(spid.toKey())
        if (streamState !== undefined) {
            return {
                id: spid.streamId,
                partition: spid.streamPartition,
                neighbors: [...streamState.neighbors],
                counter: streamState.counter
            }
        } else {
            return {
                id: spid.streamId,
                partition: spid.streamPartition,
                neighbors: [],
                counter: COUNTER_UNSUBSCRIBE
            }
        }
    }

    removeNodeFromAllSPIDs(node: NodeId): SPID[] {
        const spids: SPID[] = []
        this.states.forEach(({ neighbors }, spidKey) => {
            const isRemoved = neighbors.delete(node)
            if (isRemoved) {
                spids.push(SPID.from(spidKey))
            }
        })
        return spids
    }

    removeSPID(spid: SPID): void {
        this.verifyThatIsSetUp(spid)
        this.states.delete(spid.toKey())
    }

    isSetUp(spid: SPID): boolean {
        return this.states.has(spid.toKey())
    }

    isNodePresent(node: NodeId): boolean {
        return [...this.states.values()].some(({ neighbors }) => {
            return neighbors.has(node)
        })
    }

    getSPIDs(): Iterable<SPID> {
        return transformIterable(this.getSPIDKeys(), (spidKey) => SPID.from(spidKey))
    }

    getSPIDKeys(): IterableIterator<SPIDKey> {
        return this.states.keys()
    }

    getNeighborsForSPID(spid: SPID): ReadonlyArray<NodeId> {
        this.verifyThatIsSetUp(spid)
        return [...this.states.get(spid.toKey())!.neighbors]
    }

    getAllNodes(): ReadonlyArray<NodeId> {
        const nodes: NodeId[] = []
        this.states.forEach(({ neighbors }) => {
            nodes.push(...neighbors)
        })
        return _.uniq(nodes)
    }

    hasNeighbor(spid: SPID, node: NodeId): boolean {
        this.verifyThatIsSetUp(spid)
        return this.states.get(spid.toKey())!.neighbors.has(node)
    }

    private verifyThatIsSetUp(spid: SPID): void | never {
        if (!this.isSetUp(spid)) {
            throw new Error(`Stream partition ${spid} is not set up`)
        }
    }
}
