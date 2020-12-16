import { StreamIdAndPartition, StreamKey } from "../identifiers"
import { DuplicateMessageDetector, NumberPair } from "./DuplicateMessageDetector"
import { MessageLayer } from "streamr-client-protocol"

interface StreamStateRepresentation {
    inboundNodes: Array<string>
    outboundNodes: Array<string>
    counter: number
}

interface StreamState {
    detectors: Map<string, DuplicateMessageDetector> // "publisherId-msgChainId" => DuplicateMessageDetector
    inboundNodes: Set<string> // Nodes that I am subscribed to for messages
    outboundNodes: Set<string> // Nodes that subscribe to me for messages
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
            inboundNodes: new Set(),
            outboundNodes: new Set(),
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

    addInboundNode(streamId: StreamIdAndPartition, node: string): void {
        this.verifyThatIsSetUp(streamId)
        const { inboundNodes } = this.streams.get(streamId.key())!
        inboundNodes.add(node)
    }

    addOutboundNode(streamId: StreamIdAndPartition, node: string): void {
        this.verifyThatIsSetUp(streamId)
        const { outboundNodes } = this.streams.get(streamId.key())!
        outboundNodes.add(node)
    }

    removeNodeFromStream(streamId: StreamIdAndPartition, node: string): void {
        this.verifyThatIsSetUp(streamId)
        const { inboundNodes, outboundNodes } = this.streams.get(streamId.key())!
        inboundNodes.delete(node)
        outboundNodes.delete(node)
    }

    removeNodeFromAllStreams(node: string): void {
        this.streams.forEach(({ inboundNodes, outboundNodes }) => {
            inboundNodes.delete(node)
            outboundNodes.delete(node)
        })
    }

    removeStream(streamId: StreamIdAndPartition): ReadonlyArray<string> {
        this.verifyThatIsSetUp(streamId)
        const { inboundNodes, outboundNodes } = this.streams.get(streamId.key())!
        this.streams.delete(streamId.key())
        return [...new Set([...inboundNodes, ...outboundNodes])]
    }

    isSetUp(streamId: StreamIdAndPartition) {
        return this.streams.has(streamId.key())
    }

    isNodePresent(node: string): boolean {
        return [...this.streams.values()].some(({ inboundNodes, outboundNodes }) => {
            return inboundNodes.has(node) || outboundNodes.has(node)
        })
    }

    getStreams(): ReadonlyArray<StreamIdAndPartition> {
        return this.getStreamsAsKeys().map((key) => StreamIdAndPartition.fromKey(key))
    }

    getStreamsWithConnections(filterFn: (streamKey: string) => boolean): { [key: string]: StreamStateRepresentation } {
        const result: { [key: string]: StreamStateRepresentation } = {}
        this.streams.forEach(({ inboundNodes, outboundNodes, counter }, streamKey) => {
            if (filterFn(streamKey)) {
                result[streamKey] = {
                    inboundNodes: [...inboundNodes],
                    outboundNodes: [...outboundNodes],
                    counter
                }
            }
        })
        return result
    }

    getStreamsAsKeys(): ReadonlyArray<StreamKey> {
        return [...this.streams.keys()].sort()
    }

    getOutboundNodesForStream(streamId: StreamIdAndPartition): ReadonlyArray<string> {
        this.verifyThatIsSetUp(streamId)
        return [...this.streams.get(streamId.key())!.outboundNodes]
    }

    getInboundNodesForStream(streamId: StreamIdAndPartition): ReadonlyArray<string> {
        this.verifyThatIsSetUp(streamId)
        return [...this.streams.get(streamId.key())!.inboundNodes]
    }

    getAllNodesForStream(streamId: StreamIdAndPartition): ReadonlyArray<string> {
        return [...new Set([
            ...this.getInboundNodesForStream(streamId),
            ...this.getOutboundNodesForStream(streamId)])].sort()
    }

    getAllNodes(): ReadonlyArray<string> {
        const nodes: string[] = []
        this.streams.forEach(({ inboundNodes, outboundNodes }) => {
            nodes.push(...inboundNodes)
            nodes.push(...outboundNodes)
        })
        return [...new Set(nodes)]
    }

    hasOutboundNode(streamId: StreamIdAndPartition, node: string): boolean {
        this.verifyThatIsSetUp(streamId)
        return this.streams.get(streamId.key())!.outboundNodes.has(node)
    }

    hasInboundNode(streamId: StreamIdAndPartition, node: string): boolean {
        this.verifyThatIsSetUp(streamId)
        return this.streams.get(streamId.key())!.inboundNodes.has(node)
    }

    private verifyThatIsSetUp(streamId: StreamIdAndPartition): void | never {
        if (!this.isSetUp(streamId)) {
            throw new Error(`Stream ${streamId} is not set up`)
        }
    }
}
