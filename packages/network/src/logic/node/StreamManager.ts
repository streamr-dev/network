import { MessageLayer, SPID, SPIDKey } from 'streamr-client-protocol'
import { StreamStatus } from '../../identifiers'
import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector'
import { NodeId } from './Node'
import { COUNTER_UNSUBSCRIBE } from '../tracker/InstructionCounter'
import _ from 'lodash'
import { transformIterable } from '../../helpers/transformIterable'

interface StreamState {
    detectors: Map<string, DuplicateMessageDetector> // "publisherId-msgChainId" => DuplicateMessageDetector
    neighbors: Set<NodeId>
    counter: number,
    inOnly: Set<NodeId>,
    outOnly: Set<NodeId>,
    oneDirectional: boolean
}

function keyForDetector({ publisherId, msgChainId }: MessageLayer.MessageID) {
    return `${publisherId}-${msgChainId}`
}

export class StreamManager {
    private readonly streams: Map<SPIDKey,StreamState> = new Map<SPIDKey,StreamState>()

    setUpStream(spid: SPID, oneDirectional = false): void {
        if (!(spid instanceof SPID)) {
            throw new Error('streamId not instance of SPID')
        }
        if (this.isSetUp(spid)) {
            throw new Error(`Stream ${spid} already set up`)
        }
        this.streams.set(spid.toKey(), {
            detectors: new Map(),
            neighbors: new Set(),
            counter: 0,
            inOnly: new Set(),
            outOnly: new Set(),
            oneDirectional
        })
    }

    markNumbersAndCheckThatIsNotDuplicate(
        messageId: MessageLayer.MessageID,
        previousMessageReference: MessageLayer.MessageRef | null
    ): boolean | never {
        const spid = SPID.from(messageId)
        this.verifyThatIsSetUp(spid)

        const detectorKey = keyForDetector(messageId)
        const { detectors } = this.streams.get(spid.toKey())!
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
        this.streams.get(spid.toKey())!.counter = counter
    }

    addNeighbor(spid: SPID, node: NodeId): void {
        this.verifyThatIsSetUp(spid)
        const { neighbors } = this.streams.get(spid.toKey())!
        neighbors.add(node)
    }

    addInOnlyNeighbor(spid: SPID, node: NodeId): void {
        this.verifyThatIsSetUp(spid)
        const { inOnly } = this.streams.get(spid.toKey())!
        inOnly.add(node)
    }

    addOutOnlyNeighbor(spid: SPID, node: NodeId): void {
        this.verifyThatIsSetUp(spid)
        const { outOnly } = this.streams.get(spid.toKey())!
        outOnly.add(node)
    }

    removeNodeFromStream(spid: SPID, node: NodeId): void {
        this.verifyThatIsSetUp(spid)
        const { neighbors, inOnly, outOnly } = this.streams.get(spid.toKey())!
        neighbors.delete(node)
        inOnly.delete(node)
        outOnly.delete(node)
    }

    getStreamStatus(spid: SPID): StreamStatus {
        const streamState = this.streams.get(spid.toKey())
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

    removeNodeFromAllStreams(node: NodeId): SPID[] {
        const streams: SPID[] = []
        this.streams.forEach(({ neighbors, inOnly, outOnly }, spidKey) => {
            const isRemoved = neighbors.delete(node)
            if (isRemoved) {
                streams.push(SPID.from(spidKey))
            }
            inOnly.delete(node)
            outOnly.delete(node)
        })
        return streams
    }

    removeStream(spid: SPID): void {
        this.verifyThatIsSetUp(spid)
        this.streams.delete(spid.toKey())
    }

    isSetUp(spid: SPID): boolean {
        return this.streams.has(spid.toKey())
    }

    isNodePresent(node: NodeId): boolean {
        return [...this.streams.values()].some(({ neighbors, inOnly, outOnly }) => {
            return neighbors.has(node) || inOnly.has(node) || outOnly.has(node)
        })
    }

    getSPIDs(): Iterable<SPID> {
        return transformIterable(this.getSPIDKeys(), (spidKey) => SPID.from(spidKey))
    }

    getSPIDKeys(): IterableIterator<SPIDKey> {
        return this.streams.keys()
    }

    getNeighborsForStream(spid: SPID): ReadonlyArray<NodeId> {
        this.verifyThatIsSetUp(spid)
        return [...this.streams.get(spid.toKey())!.neighbors]
    }

    getOutboundNodesForStream(spid: SPID): ReadonlyArray<NodeId> {
        this.verifyThatIsSetUp(spid)
        return [...this.streams.get(spid.toKey())!.neighbors, ...this.streams.get(spid.toKey())!.outOnly]
    }

    getInboundNodesForStream(spid: SPID): ReadonlyArray<NodeId> {
        this.verifyThatIsSetUp(spid)
        return [...this.streams.get(spid.toKey())!.neighbors, ...this.streams.get(spid.toKey())!.inOnly]
    }

    getAllNodesForStream(spid: SPID): ReadonlyArray<NodeId> {
        this.verifyThatIsSetUp(spid)
        return [...this.streams.get(spid.toKey())!.neighbors, ...this.streams.get(spid.toKey())!.inOnly, ...this.streams.get(spid.toKey())!.outOnly]
    }

    getAllNodes(): ReadonlyArray<NodeId> {
        const nodes: NodeId[] = []
        this.streams.forEach(({ neighbors }) => {
            nodes.push(...neighbors)
        })
        return _.uniq(nodes)
    }

    hasNeighbor(spid: SPID, node: NodeId): boolean {
        this.verifyThatIsSetUp(spid)
        return this.streams.get(spid.toKey())!.neighbors.has(node)
    }

    hasOutOnlyConnection(spid: SPID, node: NodeId): boolean {
        this.verifyThatIsSetUp(spid)
        return this.streams.get(spid.toKey())!.outOnly.has(node)
    }

    hasInOnlyConnection(spid: SPID, node: NodeId): boolean {
        this.verifyThatIsSetUp(spid)
        return this.streams.get(spid.toKey())!.inOnly.has(node)
    }

    hasInboundConnection(spid: SPID, node: NodeId): boolean {
        return this.hasInOnlyConnection(spid, node) || this.hasNeighbor(spid, node)
    }

    isOneDirectional(spid: SPID): boolean {
        try {
            this.verifyThatIsSetUp(spid)
            return this.streams.get(spid.toKey())!.oneDirectional
        }
        catch (err) {
            return false
        }
    }

    private verifyThatIsSetUp(spid: SPID): void | never {
        if (!this.isSetUp(spid)) {
            throw new Error(`Stream ${spid} is not set up`)
        }
    }
}
