import { MessageLayer, StreamPartID, StreamPartIDUtils } from 'streamr-client-protocol'
import { StreamStatus } from '../../identifiers'
import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector'
import { NodeId } from './Node'
import { COUNTER_UNSUBSCRIBE } from '../tracker/InstructionCounter'
import _ from 'lodash'

interface StreamState {
    detectors: Map<string, DuplicateMessageDetector> // "publisherId-msgChainId" => DuplicateMessageDetector
    neighbors: Set<NodeId>
    counter: number,
    inOnly: Set<NodeId>,
    outOnly: Set<NodeId>,
    isBehindProxy: boolean
}

function keyForDetector({ publisherId, msgChainId }: MessageLayer.MessageID) {
    return `${publisherId}-${msgChainId}`
}

export class StreamManager {
    private readonly streams = new Map<StreamPartID,StreamState>()

    setUpStream(streamPartId: StreamPartID, isBehindProxy = false): void {
        if (this.isSetUp(streamPartId)) {
            throw new Error(`Stream part ${streamPartId} already set up`)
        }
        this.streams.set(streamPartId, {
            detectors: new Map(),
            neighbors: new Set(),
            counter: 0,
            inOnly: new Set(),
            outOnly: new Set(),
            isBehindProxy
        })
    }

    markNumbersAndCheckThatIsNotDuplicate(
        messageId: MessageLayer.MessageID,
        previousMessageReference: MessageLayer.MessageRef | null
    ): boolean | never {
        const streamPartId = messageId.getStreamPartID()
        this.ensureThatIsSetUp(streamPartId)

        const detectorKey = keyForDetector(messageId)
        const { detectors } = this.streams.get(streamPartId)!
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

    updateCounter(streamPartId: StreamPartID, counter: number): void {
        this.streams.get(streamPartId)!.counter = counter
    }

    addNeighbor(streamPartId: StreamPartID, node: NodeId): void {
        this.ensureThatIsSetUp(streamPartId)
        const { neighbors } = this.streams.get(streamPartId)!
        neighbors.add(node)
    }

    addInOnlyNeighbor(streamPartId: StreamPartID, node: NodeId): void {
        this.ensureThatIsSetUp(streamPartId)
        const { inOnly } = this.streams.get(streamPartId)!
        inOnly.add(node)
    }

    addOutOnlyNeighbor(streamPartId: StreamPartID, node: NodeId): void {
        this.ensureThatIsSetUp(streamPartId)
        const { outOnly } = this.streams.get(streamPartId)!
        outOnly.add(node)
    }

    removeNodeFromStream(streamPartId: StreamPartID, node: NodeId): void {
        this.ensureThatIsSetUp(streamPartId)
        const { neighbors, inOnly, outOnly } = this.streams.get(streamPartId)!
        neighbors.delete(node)
        inOnly.delete(node)
        outOnly.delete(node)
    }

    getStreamStatus(streamPartId: StreamPartID): StreamStatus {
        const streamState = this.streams.get(streamPartId)
        const [id, partition] = StreamPartIDUtils.getStreamIDAndStreamPartition(streamPartId)
        if (streamState !== undefined) {
            return {
                id,
                partition,
                neighbors: [...streamState.neighbors],
                counter: streamState.counter
            }
        } else {
            return {
                id,
                partition,
                neighbors: [],
                counter: COUNTER_UNSUBSCRIBE
            }
        }
    }

    removeNodeFromAllStreams(node: NodeId): [StreamPartID[], StreamPartID[]] {
        const streamParts: StreamPartID[] = []
        const notRemovedProxies: StreamPartID[] = []
        this.streams.forEach(({ neighbors, inOnly, outOnly }, streamPartId) => {
            const isRemoved = neighbors.delete(node)
            if (isRemoved) {
                streamParts.push(streamPartId)
            }
            if (this.isBehindProxy(streamPartId)) {
                notRemovedProxies.push(streamPartId)
            } else {
                inOnly.delete(node)
                outOnly.delete(node)
            }
        })
        return [streamParts, notRemovedProxies]
    }

    removeStream(streamPartId: StreamPartID): void {
        this.ensureThatIsSetUp(streamPartId)
        this.streams.delete(streamPartId)
    }

    isSetUp(streamPartId: StreamPartID): boolean {
        return this.streams.has(streamPartId)
    }

    isNodePresent(node: NodeId): boolean {
        return [...this.streams.values()].some(({ neighbors, inOnly, outOnly }) => {
            return neighbors.has(node) || inOnly.has(node) || outOnly.has(node)
        })
    }

    getStreamParts(): IterableIterator<StreamPartID> {
        return this.streams.keys()
    }

    getNeighborsForStream(streamPartId: StreamPartID): ReadonlyArray<NodeId> {
        this.ensureThatIsSetUp(streamPartId)
        return [...this.streams.get(streamPartId)!.neighbors]
    }

    getOutboundNodesForStream(streamPartId: StreamPartID): ReadonlyArray<NodeId> {
        this.ensureThatIsSetUp(streamPartId)
        const { neighbors, outOnly } = this.streams.get(streamPartId)!
        return [...neighbors, ...outOnly]
    }

    getInboundNodesForStream(streamPartId: StreamPartID): ReadonlyArray<NodeId> {
        this.ensureThatIsSetUp(streamPartId)
        const { neighbors, inOnly } = this.streams.get(streamPartId)!
        return [...neighbors, ...inOnly]
    }

    getAllNodesForStream(streamPartId: StreamPartID): ReadonlyArray<NodeId> {
        this.ensureThatIsSetUp(streamPartId)
        const { neighbors, inOnly, outOnly } = this.streams.get(streamPartId)!
        return [...neighbors, ...inOnly, ...outOnly]
    }

    getAllNodes(): ReadonlyArray<NodeId> {
        const nodes: NodeId[] = []
        this.streams.forEach(({ neighbors }) => {
            nodes.push(...neighbors)
        })
        return _.uniq(nodes)
    }

    hasNeighbor(streamPartId: StreamPartID, node: NodeId): boolean {
        this.ensureThatIsSetUp(streamPartId)
        return this.streams.get(streamPartId)!.neighbors.has(node)
    }

    hasOutOnlyConnection(streamPartId: StreamPartID, node: NodeId): boolean {
        this.ensureThatIsSetUp(streamPartId)
        return this.streams.get(streamPartId)!.outOnly.has(node)
    }

    hasInOnlyConnection(streamPartId: StreamPartID, node: NodeId): boolean {
        this.ensureThatIsSetUp(streamPartId)
        return this.streams.get(streamPartId)!.inOnly.has(node)
    }

    hasInboundConnection(streamPartId: StreamPartID, node: NodeId): boolean {
        return this.hasInOnlyConnection(streamPartId, node) || this.hasNeighbor(streamPartId, node)
    }

    isBehindProxy(streamPartId: StreamPartID): boolean {
        try {
            this.ensureThatIsSetUp(streamPartId)
            return this.streams.get(streamPartId)!.isBehindProxy
        }
        catch (err) {
            return false
        }
    }

    private ensureThatIsSetUp(streamPartId: StreamPartID): void | never {
        if (!this.isSetUp(streamPartId)) {
            throw new Error(`Stream part ${streamPartId} is not set up`)
        }
    }
}
