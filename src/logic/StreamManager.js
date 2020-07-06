const { StreamIdAndPartition } = require('../identifiers')

const { DuplicateMessageDetector, NumberPair } = require('./DuplicateMessageDetector')

const keyForDetector = ({ publisherId, msgChainId }) => `${publisherId}-${msgChainId}`

module.exports = class StreamManager {
    constructor() {
        this.streams = new Map() // streamKey => {}
    }

    setUpStream(streamId) {
        if (!(streamId instanceof StreamIdAndPartition)) {
            throw new Error('streamId not instance of StreamIdAndPartition')
        }
        if (this.isSetUp(streamId)) {
            throw new Error(`Stream ${streamId} already set up`)
        }
        this.streams.set(streamId.key(), {
            detectors: new Map(), // "publisherId-msgChainId" => DuplicateMessageDetector
            inboundNodes: new Set(), // Nodes that I am subscribed to for messages
            outboundNodes: new Set(), // Nodes (and clients) that subscribe to me for messages
            counter: 0
        })
    }

    markNumbersAndCheckThatIsNotDuplicate(messageId, previousMessageReference) {
        const streamIdAndPartition = new StreamIdAndPartition(messageId.streamId, messageId.streamPartition)
        this._verifyThatIsSetUp(streamIdAndPartition)

        const detectorKey = keyForDetector(messageId)
        const { detectors } = this.streams.get(streamIdAndPartition.key())
        if (!detectors.has(detectorKey)) {
            detectors.set(detectorKey, new DuplicateMessageDetector())
        }

        return detectors.get(detectorKey).markAndCheck(
            previousMessageReference === null
                ? null
                : new NumberPair(previousMessageReference.timestamp, previousMessageReference.sequenceNumber),
            new NumberPair(messageId.timestamp, messageId.sequenceNumber)
        )
    }

    updateCounter(streamId, counter) {
        this.streams.get(streamId.key()).counter = counter
    }

    addInboundNode(streamId, node) {
        this._verifyThatIsSetUp(streamId)
        const { inboundNodes } = this.streams.get(streamId.key())
        inboundNodes.add(node)
    }

    addOutboundNode(streamId, node) {
        this._verifyThatIsSetUp(streamId)
        const { outboundNodes } = this.streams.get(streamId.key())
        outboundNodes.add(node)
    }

    removeNodeFromStream(streamId, node) {
        this._verifyThatIsSetUp(streamId)
        const { inboundNodes, outboundNodes } = this.streams.get(streamId.key())
        inboundNodes.delete(node)
        outboundNodes.delete(node)
    }

    removeNodeFromAllStreams(node) {
        this.streams.forEach(({ inboundNodes, outboundNodes }) => {
            inboundNodes.delete(node)
            outboundNodes.delete(node)
        })
    }

    removeStream(streamId) {
        this._verifyThatIsSetUp(streamId)
        const { inboundNodes, outboundNodes } = this.streams.get(streamId.key())
        this.streams.delete(streamId.key())
        return [...new Set([...inboundNodes, ...outboundNodes])]
    }

    isSetUp(streamId) {
        return this.streams.has(streamId.key())
    }

    isNodePresent(node) {
        return [...this.streams.values()].some(({ inboundNodes, outboundNodes }) => {
            return inboundNodes.has(node) || outboundNodes.has(node)
        })
    }

    getStreams() {
        return this.getStreamsAsKeys().map((key) => StreamIdAndPartition.fromKey(key))
    }

    getStreamsWithConnections(tracker, trackersRing) {
        const result = {}
        this.streams.forEach(({ inboundNodes, outboundNodes, counter }, streamKey) => {
            let addToStatus = true

            if (tracker && trackersRing) {
                const targetTracker = trackersRing.get(streamKey)
                addToStatus = targetTracker === tracker
            }

            if (addToStatus) {
                result[streamKey] = {
                    inboundNodes: [...inboundNodes],
                    outboundNodes: [...outboundNodes],
                    counter
                }
            }
        })
        return result
    }

    getStreamsAsKeys() {
        return [...this.streams.keys()].sort()
    }

    getOutboundNodesForStream(streamId) {
        this._verifyThatIsSetUp(streamId)
        return [...this.streams.get(streamId.key()).outboundNodes]
    }

    getInboundNodesForStream(streamId) {
        this._verifyThatIsSetUp(streamId)
        return [...this.streams.get(streamId.key()).inboundNodes]
    }

    getAllNodesForStream(streamId) {
        return [...new Set([...this.getInboundNodesForStream(streamId), ...this.getOutboundNodesForStream(streamId)])].sort()
    }

    getAllNodes() {
        const nodes = []
        this.streams.forEach(({ inboundNodes, outboundNodes }) => {
            nodes.push(...inboundNodes)
            nodes.push(...outboundNodes)
        })
        return [...new Set(nodes)]
    }

    hasOutboundNode(streamId, node) {
        this._verifyThatIsSetUp(streamId)
        return this.streams.get(streamId.key()).outboundNodes.has(node)
    }

    hasInboundNode(streamId, node) {
        this._verifyThatIsSetUp(streamId)
        return this.streams.get(streamId.key()).inboundNodes.has(node)
    }

    _verifyThatIsSetUp(streamId) {
        if (!this.isSetUp(streamId)) {
            throw new Error(`Stream ${streamId} is not set up`)
        }
    }
}
