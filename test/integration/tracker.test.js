const { startNode, startTracker } = require('../../src/composition')
const { LOCALHOST, waitForEvent } = require('../../test/util')
const { callbackToPromise } = require('../../src/util')
const TrackerServer = require('../../src/protocol/TrackerServer')

describe('check tracker, nodes and statuses from nodes', () => {
    let tracker
    let node1
    let node2

    it('should be able to start tracker, two nodes, receive statuses, then stop them successfully', async (done) => {
        tracker = await startTracker(LOCALHOST, 32400, 'tracker')
        expect(tracker.protocols.trackerServer.endpoint.connections.size).toBe(0)

        node1 = await startNode(LOCALHOST, 33371, 'node1')
        await node1.addBootstrapTracker(tracker.getAddress())

        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        expect(tracker.protocols.trackerServer.endpoint.connections.size).toBe(1)

        expect(node1.protocols.trackerNode.endpoint.connections.size).toBe(1)

        node2 = await startNode(LOCALHOST, 33372, 'node2')
        await node2.addBootstrapTracker(tracker.getAddress())

        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        // TODO add status checkes - leaders and etc
        done()
    })

    afterAll(async (done) => {
        await callbackToPromise(node1.stop.bind(node1))
        await callbackToPromise(node2.stop.bind(node2))
        tracker.stop(done)
    })
})
