const { startNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const { callbackToPromise } = require('../../src/util')
const { PRIVATE_KEY } = require('../util')

jest.setTimeout(30 * 1000)

/**
 * When a node receives a message for a stream it doesn't recognize, it asks the
 * tracker who is responsible for that stream. In this test we verify that the
 * initial message that causes this is also eventually delivered.
 */
describe('message buffering of Node', () => {
    let tracker
    let sourceNode
    let destinationNode

    beforeAll(async (done) => {
        tracker = await startTracker('127.0.0.1', 30300, PRIVATE_KEY)
        sourceNode = await startNode('127.0.0.1', 30321)
        destinationNode = await startNode('127.0.0.1', 30322)

        // TODO: use p-event to listen to TrackerNode.events.NODE_LIST_RECEIVED when issue #86 merged
        setTimeout(done, 8000)
    })

    afterAll(async (done) => {
        await callbackToPromise(sourceNode.stop.bind(sourceNode))
        await callbackToPromise(destinationNode.stop.bind(destinationNode))
        tracker.stop(done)
    })

    test('first message to unknown stream eventually gets delivered', async (done) => {
        destinationNode.addOwnStream('stream-id')
        destinationNode.on(Node.events.MESSAGE_RECEIVED, (streamId, data) => {
            expect(streamId).toEqual('stream-id')
            expect(data).toEqual({
                hello: 'world'
            })
            done()
        })

        // TODO: use p-event to listen to Tracker.events.STATUS_RECEIVED when issue #86 merged
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // "Client" pushes data
        sourceNode.onDataReceived('stream-id', {
            hello: 'world'
        })
    })
})
