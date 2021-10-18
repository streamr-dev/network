import { MessageLayer, SPID, SPIDKey } from 'streamr-client-protocol'
import { StreamStatus } from '../../identifiers'
import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector'
import { NodeId } from './Node'
import { COUNTER_UNSUBSCRIBE } from '../tracker/InstructionCounter'
import _ from 'lodash'

interface StreamState {
    detectors: Map<string, DuplicateMessageDetector> // "publisherId-msgChainId" => DuplicateMessageDetector
    neighbors: Set<NodeId>
    counter: number
}

function keyForDetector({ publisherId, msgChainId }: MessageLayer.MessageID) {
    return `${publisherId}-${msgChainId}`
}

export class StreamManager {
    private readonly streams: Map<SPIDKey,StreamState> = new Map<SPIDKey,StreamState>() // spidKey => {}

    setUpStream(spid: SPID): void {
        if (!(spid instanceof SPID)) {
            throw new Error('streamId not instance of SPID')
        }
        if (this.isSetUp(spid)) {
            throw new Error(`Stream ${spid} already set up`)
        }
        this.streams.set(spid.toKey(), {
            detectors: new Map(),
            neighbors: new Set(),
            counter: 0
        })
    }

    markNumbersAndCheckThatIsNotDuplicate(
        messageId: MessageLayer.MessageID,
        previousMessageReference: MessageLayer.MessageRef | null
    ): boolean | never {
        const spid = new SPID(messageId.streamId, messageId.streamPartition)
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

    removeNodeFromStream(spid: SPID, node: NodeId): void {
        this.verifyThatIsSetUp(spid)
        const { neighbors } = this.streams.get(spid.toKey())!
        neighbors.delete(node)
    }

    getStreamStatus(spid: SPID): StreamStatus {
        const streamState = this.streams.get(spid.toKey())
        if (streamState !== undefined) {
            return {
                spidKey: spid.toKey(),  
                neighbors: [...streamState.neighbors],
                counter: streamState.counter
            }
        } else {
            return {
                spidKey: spid.toKey(),
                neighbors: [],
                counter: COUNTER_UNSUBSCRIBE
            }
        }
    }

    removeNodeFromAllStreams(node: NodeId): SPID[] {
        const streams: SPID[] = []
        this.streams.forEach(({ neighbors }, spidKey) => {
            const isRemoved = neighbors.delete(node)
            if (isRemoved) {
                streams.push(SPID.from(spidKey))
            }
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
        return [...this.streams.values()].some(({ neighbors }) => {
            return neighbors.has(node)
        })
    }

    // TODO: rename to getSortedStreams() (or remove sort functionality altogether)
    getStreams(): ReadonlyArray<SPID> {
        return this.getStreamsAsKeys().map((key) => SPID.from(key))
    }

    // TODO remove this method and use getSPIDKeys?
    *getStreamsIterable(): IterableIterator<SPID> {
        for (const spidKey of this.getSPIDKeys()) {
            yield SPID.from(spidKey)
        }
    }

    // efficient way to access streams
    getSPIDKeys(): IterableIterator<SPIDKey> {
        return this.streams.keys()
    }

    // TODO: rename to getStreamKeysAsSortedArray (or remove sort functionality altogether)
    getStreamsAsKeys(): ReadonlyArray<SPIDKey> {
        return [...this.streams.keys()].sort()
    }

    getNeighborsForStream(spid: SPID): ReadonlyArray<NodeId> {
        this.verifyThatIsSetUp(spid)
        return [...this.streams.get(spid.toKey())!.neighbors]
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

    private verifyThatIsSetUp(spid: SPID): void | never {
        if (!this.isSetUp(spid)) {
            throw new Error(`Stream ${spid} is not set up`)
        }
    }
}
