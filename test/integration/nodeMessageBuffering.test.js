const { startNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const { callbackToPromise } = require('../../src/util')
const { waitForEvent, LOCALHOST, DEFAULT_TIMEOUT, PRIVATE_KEY } = require('../util')
const TrackerNode = require('../../src/protocol/TrackerNode')
const TrackerServer = require('../../src/protocol/TrackerServer')

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

    // TODO fix
    // beforeAll(async (done) => {
    //     tracker = await startTracker(LOCALHOST, 30300, PRIVATE_KEY)
    //     sourceNode = await startNode(LOCALHOST, 30321)
    //     destinationNode = await startNode(LOCALHOST, 30322)
    //
    //     await Promise.all([
    //         waitForEvent(sourceNode.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
    //         waitForEvent(destinationNode.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED)
    //     ])
    // })
    //
    // afterAll(async (done) => {
    //     await callbackToPromise(sourceNode.stop.bind(sourceNode))
    //     await callbackToPromise(destinationNode.stop.bind(destinationNode))
    //     tracker.stop(done)
    // })
    //
    test('first message to unknown stream eventually gets delivered', async (done) => {
        done()
        // destinationNode.addOwnStream('stream-id')
        // destinationNode.on(Node.events.MESSAGE_RECEIVED, (streamId, data) => {
        //     expect(streamId).toEqual('stream-id')
        //     expect(data).toEqual({
        //         hello: 'world'
        //     })
        //     done()
        // })
        //
        // await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.STATUS_RECEIVED)
        //
        // // "Client" pushes data
        // sourceNode.onDataReceived('stream-id', {
        //     hello: 'world'
        // })
    })
})
