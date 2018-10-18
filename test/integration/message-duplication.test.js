const { startNetworkNode, startTracker } = require('../../src/composition')
const { callbackToPromise } = require('../../src/util')
const { wait, waitForEvent, LOCALHOST, DEFAULT_TIMEOUT } = require('../util')
const TrackerNode = require('../../src/protocol/TrackerNode')
const TrackerServer = require('../../src/protocol/TrackerServer')

jest.setTimeout(DEFAULT_TIMEOUT)

/**
 * This test verifies that on receiving a duplicate message, it is not re-emitted to the repeater's subscribers.
 */
describe('duplicate message detection and avoidance', () => {
    let tracker
    let leaderNode
    let repeaterNodes
    let numOfReceivedMessages

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 30350, 'tracker')
        leaderNode = await startNetworkNode(LOCALHOST, 30351, 'leaderNode')
        leaderNode.setBootstrapTrackers([tracker.getAddress()])

        repeaterNodes = await Promise.all([
            startNetworkNode(LOCALHOST, 30352, 'repeaterNode-1'),
            startNetworkNode(LOCALHOST, 30353, 'repeaterNode-2'),
            startNetworkNode(LOCALHOST, 30354, 'repeaterNode-3'),
            startNetworkNode(LOCALHOST, 30355, 'repeaterNode-4'),
            startNetworkNode(LOCALHOST, 30356, 'repeaterNode-5'),
        ])
        repeaterNodes.forEach((repeaterNode) => {
            repeaterNode.setBootstrapTrackers([tracker.getAddress()])
        })

        // Wait for nodes to connect to each other
        await Promise.all([
            waitForEvent(leaderNode.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(repeaterNodes[0].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(repeaterNodes[1].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(repeaterNodes[2].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(repeaterNodes[3].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(repeaterNodes[4].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
        ])

        // Become leader
        leaderNode.publish('stream-id', 0, {})
        await waitForEvent(leaderNode.protocols.trackerNode, TrackerNode.events.STREAM_ASSIGNED)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        // Become repeaters (one-by-one, for well connected graph)
        await repeaterNodes[0].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await repeaterNodes[1].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await repeaterNodes[2].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await repeaterNodes[3].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await repeaterNodes[4].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        // Set up 1st test case
        numOfReceivedMessages = [0, 0, 0, 0, 0]
        const updater = (i) => () => {
            numOfReceivedMessages[i] += 1
        }
        for (let i = 0; i < repeaterNodes.length; ++i) {
            repeaterNodes[i].addMessageListener(updater(i))
        }

        // Produce data
        leaderNode.publish('stream-id', 0, {
            hello: 'world'
        })
        leaderNode.publish('stream-id', 0, {
            foo: 'bar'
        })
        await wait(2000)
    })

    afterAll(async () => {
        await callbackToPromise(leaderNode.stop.bind(leaderNode))
        await Promise.all(repeaterNodes.map((node) => callbackToPromise(node.stop.bind(node))))
        await callbackToPromise(tracker.stop.bind(tracker))
    })

    test('same message is emitted by a repeater exactly once', () => {
        expect(numOfReceivedMessages).toEqual([2, 2, 2, 2, 2])
    })

    test('maximum times a repeater receives duplicates of message is bounded by total number of repeaters', () => {
        const numOfDuplicates = repeaterNodes.map((n) => n.metrics.received.duplicates)
        expect(numOfDuplicates).toHaveLength(5)
        numOfDuplicates.forEach((n) => {
            expect(n).toBeLessThanOrEqual((repeaterNodes.length * 2)) // multiplier because 2 separate messages
        })
    })
})
