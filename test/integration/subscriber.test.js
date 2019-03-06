const { startNetworkNode, startTracker, startClient } = require('../../src/composition')
const { callbackToPromise } = require('../../src/util')
const { waitForEvent, LOCALHOST, DEFAULT_TIMEOUT } = require('../util')
const NodeToNode = require('../../src/protocol/NodeToNode')
const { StreamID, MessageID, MessageReference } = require('../../src/identifiers')
const TrackerNode = require('../../src/protocol/TrackerNode')

jest.setTimeout(DEFAULT_TIMEOUT)

describe('Selecting leader for the stream and sending messages to two subscribers', () => {
    let tracker
    let nodeOne
    let nodeTwo
    let publisher

    const streamId = 'stream-id'
    const streamIdObj = new StreamID(streamId, 0)

    it('should be select leader and get two active subscribers', async (done) => {
        tracker = await startTracker(LOCALHOST, 32300, 'tracker')

        await Promise.all([
            startNetworkNode(LOCALHOST, 32312, 'node-1'),
            startNetworkNode(LOCALHOST, 32313, 'node-2')
        ]).then((res) => {
            [nodeOne, nodeTwo] = res
        })

        await nodeOne.addBootstrapTracker(tracker.getAddress())
        await nodeTwo.addBootstrapTracker(tracker.getAddress())

        publisher = await startClient(LOCALHOST, 32301, 'publisher-1', nodeOne.protocols.nodeToNode.getAddress())
        await publisher.protocols.nodeToNode.endpoint.connect(nodeOne.protocols.nodeToNode.getAddress())

        nodeOne.subscribe(streamId, 0)
        nodeTwo.subscribe(streamId, 0)

        let timestamp = 1000
        let previousMessageReference = null
        const publisherInterval = setInterval(() => {
            const messageId = new MessageID(streamIdObj, timestamp, 0, 'publisher-id')
            publisher.publish(messageId, previousMessageReference, `Hello world ${timestamp}!`)
            previousMessageReference = new MessageReference(timestamp, 0)
            timestamp += 1000
        }, 1000)

        await Promise.all([
            waitForEvent(nodeOne.protocols.nodeToNode, NodeToNode.events.DATA_RECEIVED),
            waitForEvent(nodeTwo.protocols.nodeToNode, NodeToNode.events.DATA_RECEIVED)
        ]).then(() => {
            expect(nodeOne.streams.getOutboundNodesForStream(streamIdObj)).toContain('node-2')
            expect(nodeTwo.streams.getOutboundNodesForStream(streamIdObj)).toContain('node-1')
            clearInterval(publisherInterval)

            done()
        })
    })

    // TODO test disconnect and more than one stream
    afterAll(async () => {
        await callbackToPromise(publisher.stop.bind(publisher))
        await callbackToPromise(nodeOne.stop.bind(nodeOne))
        await callbackToPromise(nodeTwo.stop.bind(nodeTwo))
        await callbackToPromise(tracker.stop.bind(tracker))
    })
})
