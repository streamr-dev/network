const { StreamID } = require('../identifiers')
const { DuplicateMessageDetector, NumberPair } = require('./DuplicateMessageDetector')

module.exports = class StreamManager {
    constructor() {
        this.streams = new Map() // streamId => {}
    }

    setUpStream(streamId) {
        if (!(streamId instanceof StreamID)) {
            throw new Error('streamId not instance of StreamID')
        }
        if (this.isSetUp(streamId)) {
            throw new Error(`Stream ${streamId} already set up`)
        }
        this.streams.set(streamId.key(), {
            detectorPerPublisher: new Map(), // publisherId => DuplicateMessageDetector
            inboundNodes: new Set(), // Nodes that I am subscribed to for messages
            outboundNodes: new Set() // Nodes (and clients) that subscribe to me for messages
        })
    }

    markNumbersAndCheckThatIsNotDuplicate(messageId, previousMessageReference) {
        this._verifyThatIsSetUp(messageId.streamId)

        const { detectorPerPublisher } = this.streams.get(messageId.streamId.key())
        if (!detectorPerPublisher.has(messageId.publisherId)) {
            detectorPerPublisher.set(messageId.publisherId, new DuplicateMessageDetector())
        }

        return detectorPerPublisher.get(messageId.publisherId).markAndCheck(
            previousMessageReference === null
                ? null
                : new NumberPair(previousMessageReference.timestamp, previousMessageReference.sequenceNo),
            new NumberPair(messageId.timestamp, messageId.sequenceNo)
        )
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

    isSetUp(streamId) {
        return this.streams.has(streamId.key())
    }

    getStreams() {
        return this.getStreamsAsKeys().map((key) => StreamID.fromKey(key))
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

    getAllNodes() {
        let allInboundNodes = new Set()
        let allOutboundNodes = new Set()
        this.streams.forEach(({ inboundNodes, outboundNodes }) => {
            allInboundNodes = new Set([...allInboundNodes, ...inboundNodes])
            allOutboundNodes = new Set([...allOutboundNodes, ...outboundNodes])
        })

        return {
            allInboundNodes,
            allOutboundNodes
        }
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
