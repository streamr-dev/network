const { startNetworkNode, startTracker, startStorageNode } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const TrackerServer = require('../../src/protocol/TrackerServer')
const { LOCALHOST, waitForEvent } = require('../util')

describe('tracker assigns storage node to streams', () => {
    let tracker
    let subscriberOne
    let subscriberTwo
    let storageNode

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 31950, 'tracker')
        storageNode = await startStorageNode(LOCALHOST, 31954, 'storageNode')
        subscriberOne = await startNetworkNode(LOCALHOST, 31952, 'subscriberOne')
        subscriberTwo = await startNetworkNode(LOCALHOST, 31953, 'subscriberTwo')

        subscriberOne.subscribe('stream-1', 0)
        subscriberTwo.subscribe('stream-2', 0)

        subscriberOne.addBootstrapTracker(tracker.getAddress())
        subscriberTwo.addBootstrapTracker(tracker.getAddress())

        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        storageNode.addBootstrapTracker(tracker.getAddress())
    })

    afterAll(async () => {
        await storageNode.stop()
        await subscriberOne.stop()
        await subscriberTwo.stop()
        await tracker.stop()
    })

    it('existing streams are assigned to storage node', async () => {
        subscriberOne.publish('stream-1', 0, 5, 0, 'publisherId', 'msgChainId', null, null, {}, 0, '')
        subscriberTwo.publish('stream-2', 0, 10, 0, 'publisherId', 'msgChainId', null, null, {}, 0, '')

        const [msg1] = await waitForEvent(storageNode, Node.events.MESSAGE_PROPAGATED)
        const [msg2] = await waitForEvent(storageNode, Node.events.MESSAGE_PROPAGATED)
        expect(msg1.getStreamId()).toEqual('stream-1')
        expect(msg2.getStreamId()).toEqual('stream-2')
    })

    it('new streams are assigned to storage node', async () => {
        subscriberOne.publish('new-stream-1', 0, 5, 0, 'publisherId', 'msgChainId', null, null, {}, 0, '')
        subscriberTwo.publish('new-stream-2', 0, 10, 0, 'publisherId', 'msgChainId', null, null, {}, 0, '')

        const [msg1] = await waitForEvent(storageNode, Node.events.MESSAGE_PROPAGATED)
        const [msg2] = await waitForEvent(storageNode, Node.events.MESSAGE_PROPAGATED)
        expect(msg1.getStreamId()).toEqual('new-stream-1')
        expect(msg2.getStreamId()).toEqual('new-stream-2')
    })
})
