import { StreamIdAndPartition, StreamKey, StreamStatus } from '../../identifiers'
import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector'
import { MessageLayer } from 'streamr-client-protocol'
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
    private readonly streams: Map<string, StreamState> = new Map<string, StreamState>() // streamKey => {}

    setUpStream(streamId: StreamIdAndPartition): void {
        if (!(streamId instanceof StreamIdAndPartition)) {
            throw new Error('streamId not instance of StreamIdAndPartition')
        }
        if (this.isSetUp(streamId)) {
            throw new Error(`Stream ${streamId} already set up`)
        }
        this.streams.set(streamId.key(), {
            detectors: new Map(),
            neighbors: new Set(),
            counter: 0
        })
    }

    markNumbersAndCheckThatIsNotDuplicate(
        messageId: MessageLayer.MessageID,
        previousMessageReference: MessageLayer.MessageRef | null
    ): boolean | never {
        const streamIdAndPartition = new StreamIdAndPartition(messageId.streamId, messageId.streamPartition)
        this.verifyThatIsSetUp(streamIdAndPartition)

        const detectorKey = keyForDetector(messageId)
        const { detectors } = this.streams.get(streamIdAndPartition.key())!
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

    updateCounter(streamId: StreamIdAndPartition, counter: number): void {
        this.streams.get(streamId.key())!.counter = counter
    }

    addNeighbor(streamId: StreamIdAndPartition, node: NodeId): void {
        this.verifyThatIsSetUp(streamId)
        const { neighbors } = this.streams.get(streamId.key())!
        neighbors.add(node)
    }

    removeNodeFromStream(streamId: StreamIdAndPartition, node: NodeId): void {
        this.verifyThatIsSetUp(streamId)
        const { neighbors } = this.streams.get(streamId.key())!
        neighbors.delete(node)
    }

    getStreamStatus(streamId: StreamIdAndPartition): StreamStatus {
        const streamState = this.streams.get(streamId.key())
        if (streamState !== undefined) {
            return {
                streamKey: streamId.key(),
                neighbors: [...streamState.neighbors],
                counter: streamState.counter
            }
        } else {
            return {
                streamKey: streamId.key(),
                neighbors: [],
                counter: COUNTER_UNSUBSCRIBE
            }
        }
    }

    removeNodeFromAllStreams(node: NodeId): StreamIdAndPartition[] {
        const streams: StreamIdAndPartition[] = []
        this.streams.forEach(({ neighbors }, streamKey) => {
            const isRemoved = neighbors.delete(node)
            if (isRemoved) {
                streams.push(StreamIdAndPartition.fromKey(streamKey))
            }
        })
        return streams
    }

    removeStream(streamId: StreamIdAndPartition): void {
        this.verifyThatIsSetUp(streamId)
        this.streams.delete(streamId.key())
    }

    isSetUp(streamId: StreamIdAndPartition): boolean {
        return this.streams.has(streamId.key())
    }

    isNodePresent(node: NodeId): boolean {
        return [...this.streams.values()].some(({ neighbors }) => {
            return neighbors.has(node)
        })
    }

    // TODO: rename to getSortedStreams() (or remove sort functionality altogether)
    getStreams(): ReadonlyArray<StreamIdAndPartition> {
        return this.getStreamsAsKeys().map((key) => StreamIdAndPartition.fromKey(key))
    }

    // efficient way to access streams
    getStreamKeys(): IterableIterator<StreamKey> {
        return this.streams.keys()
    }

    // TODO: rename to getStreamKeysAsSortedArray (or remove sort functionality altogether)
    getStreamsAsKeys(): ReadonlyArray<StreamKey> {
        return [...this.streams.keys()].sort()
    }

    getNeighborsForStream(streamId: StreamIdAndPartition): ReadonlyArray<NodeId> {
        this.verifyThatIsSetUp(streamId)
        return [...this.streams.get(streamId.key())!.neighbors]
    }

    getAllNodes(): ReadonlyArray<NodeId> {
        const nodes: NodeId[] = []
        this.streams.forEach(({ neighbors }) => {
            nodes.push(...neighbors)
        })
        return _.uniq(nodes)
    }

    hasNeighbor(streamId: StreamIdAndPartition, node: NodeId): boolean {
        this.verifyThatIsSetUp(streamId)
        return this.streams.get(streamId.key())!.neighbors.has(node)
    }

    private verifyThatIsSetUp(streamId: StreamIdAndPartition): void | never {
        if (!this.isSetUp(streamId)) {
            throw new Error(`Stream ${streamId} is not set up`)
        }
    }
}
