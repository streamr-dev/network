const { startNetworkNode, startTracker, startStorageNode } = require('../../src/composition')
const TrackerNode = require('../../src/protocol/TrackerNode')
const Node = require('../../src/logic/Node')
const TrackerServer = require('../../src/protocol/TrackerServer')
const { callbackToPromise, LOCALHOST, waitForEvent } = require('../util')
const { StreamID } = require('../../src/identifiers')

describe('Check tracker will subscribe storage node to all streams', () => {
    const trackerId = 'tracker'
    const subscriberOneId = 'subscriber-1'
    const subscriberTwoId = 'subscriber-2'
    const storageNodeId = 'storage-1'

    let tracker
    let subscriberOne
    let subscriberTwo
    let storageNode

    const streamIdOne = 'stream-1'
    const streamIdTwo = 'stream-2'

    const streamOne = new StreamID(streamIdOne, 0)
    const streamTwo = new StreamID(streamIdTwo, 0)

    beforeEach(async () => {
        tracker = await startTracker(LOCALHOST, 31950, trackerId)
        storageNode = await startStorageNode(LOCALHOST, 31954, storageNodeId)
        subscriberOne = await startNetworkNode(LOCALHOST, 31952, subscriberOneId)
        subscriberTwo = await startNetworkNode(LOCALHOST, 31953, subscriberTwoId)

        subscriberOne.subscribe(streamIdOne, 0)
        subscriberTwo.subscribe(streamIdTwo, 0)
    })

    afterEach(async () => {
        await callbackToPromise(storageNode.stop.bind(storageNode))
        await callbackToPromise(subscriberOne.stop.bind(subscriberOne))
        await callbackToPromise(subscriberTwo.stop.bind(subscriberTwo))
        await callbackToPromise(tracker.stop.bind(tracker))
    })

    it('tracker should register storage node and send subscribe all new streams', async () => {
        expect(tracker.storageNodes.has(storageNodeId)).toBeFalsy()

        storageNode.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        subscriberOne.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        await waitForEvent(storageNode.protocols.trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)
        expect(tracker.storageNodes.has(storageNodeId)).toBeTruthy()
        expect(storageNode.streams.getStreams()).toEqual([streamOne])

        subscriberTwo.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        await waitForEvent(storageNode.protocols.trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)
        await waitForEvent(storageNode.protocols.trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)
        expect(storageNode.streams.getStreams()).toEqual([streamOne, streamTwo])
    })

    it('tracker should register storage node and send subscribe all existing streams', async () => {
        expect(tracker.storageNodes.has(storageNodeId)).toBeFalsy()

        subscriberOne.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        subscriberTwo.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        storageNode.addBootstrapTracker(tracker.getAddress())

        await Promise.all([
            await waitForEvent(storageNode, Node.events.NODE_SUBSCRIBED),
            await waitForEvent(storageNode, Node.events.NODE_SUBSCRIBED)
        ])

        expect(storageNode.streams.getAllNodesForStream(streamOne)).toEqual([subscriberOneId])
        expect(storageNode.streams.getAllNodesForStream(streamTwo)).toEqual([subscriberTwoId])
    })

    it('tracker should subscribe and unsubscribe nodes correctly', async () => {
        subscriberOne.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        subscriberTwo.addBootstrapTracker(tracker.getAddress())
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        storageNode.addBootstrapTracker(tracker.getAddress())

        await Promise.all([
            await waitForEvent(storageNode.protocols.trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED),
            await waitForEvent(storageNode.protocols.trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)
        ])

        subscriberOne.unsubscribeFromStream(streamOne)

        await Promise.all([
            await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        ])

        expect(subscriberOne.streams.isSetUp(streamOne)).toBeFalsy()
        expect(storageNode.streams.getAllNodesForStream(streamOne)).toEqual([])
        expect(storageNode.streams.getAllNodesForStream(streamTwo)).toEqual([subscriberTwoId])
    })
})
