const { startNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const { callbackToPromise } = require('../../src/util')
const {
    waitForEvent, wait, LOCALHOST, DEFAULT_TIMEOUT, PRIVATE_KEY
} = require('../util')
const TrackerNode = require('../../src/protocol/TrackerNode')
const TrackerServer = require('../../src/protocol/TrackerServer')
const NodeToNode = require('../../src/protocol/NodeToNode')

jest.setTimeout(DEFAULT_TIMEOUT)

/**
 * When a node receives a message for a stream it doesn't recognize, it asks the
 * tracker who is responsible for that stream. In this test we verify that the
 * initial message that causes this is also eventually delivered.
 */
describe('message buffering of Node', () => {
    let tracker
    let sourceNode
    let destinationNode

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 30300, PRIVATE_KEY)
        sourceNode = await startNode(LOCALHOST, 30321)
        destinationNode = await startNode(LOCALHOST, 30322)

        await Promise.all([
            waitForEvent(sourceNode.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(destinationNode.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED)
        ])
    })

    afterAll(async (done) => {
        await callbackToPromise(sourceNode.stop.bind(sourceNode))
        await callbackToPromise(destinationNode.stop.bind(destinationNode))
        tracker.stop(done)
    })

    test('first message to unknown stream eventually gets delivered', async (done) => {
        destinationNode.on(Node.events.MESSAGE_RECEIVED, (streamId, data) => {
            expect(streamId).toEqual('stream-id')
            expect(data).toEqual({
                hello: 'world'
            })
            done()
        })

        destinationNode.subscribeToStream('stream-id')
        await wait(500) // TODO: required to not encounter issue #99 (concurrent subscription)

        // "Client" pushes data
        sourceNode.onDataReceived('stream-id', {
            hello: 'world'
        })
    })
})
