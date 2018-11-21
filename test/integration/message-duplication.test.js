const { startNetworkNode, startTracker } = require('../../src/composition')
const { callbackToPromise } = require('../../src/util')
const { wait, waitForEvent, LOCALHOST, DEFAULT_TIMEOUT } = require('../util')
const TrackerNode = require('../../src/protocol/TrackerNode')
const TrackerServer = require('../../src/protocol/TrackerServer')

jest.setTimeout(DEFAULT_TIMEOUT * 600) // TODO: remove 600

/**
 * This test verifies that on receiving a duplicate message, it is not re-emitted to the node's subscribers.
 */
describe('duplicate message detection and avoidance', () => {
    let tracker
    let contactNode
    let otherNodes
    let numOfReceivedMessages

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 30350, 'tracker')
        contactNode = await startNetworkNode(LOCALHOST, 30351, 'node-0')
        contactNode.setBootstrapTrackers([tracker.getAddress()])

        otherNodes = await Promise.all([
            startNetworkNode(LOCALHOST, 30352, 'node-1'),
            startNetworkNode(LOCALHOST, 30353, 'node-2'),
            startNetworkNode(LOCALHOST, 30354, 'node-3'),
            startNetworkNode(LOCALHOST, 30355, 'node-4'),
            startNetworkNode(LOCALHOST, 30356, 'node-5'),
        ])
        otherNodes.forEach((node) => {
            node.setBootstrapTrackers([tracker.getAddress()])
        })

        // Wait for nodes to connect to each other
        await Promise.all([
            waitForEvent(contactNode.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(otherNodes[0].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(otherNodes[1].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(otherNodes[2].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(otherNodes[3].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(otherNodes[4].protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
        ])

        // Make contactNode responsible for stream
        contactNode.publish('stream-id', 0, {}, 90, null)
        await waitForEvent(contactNode.protocols.trackerNode, TrackerNode.events.STREAM_ASSIGNED)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        // Become subscribers (one-by-one, for well connected graph)
        await otherNodes[0].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await otherNodes[1].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await otherNodes[2].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await otherNodes[3].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await otherNodes[4].subscribe('stream-id', 0)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        // Set up 1st test case
        numOfReceivedMessages = [0, 0, 0, 0, 0]
        const updater = (i) => () => {
            numOfReceivedMessages[i] += 1
        }
        for (let i = 0; i < otherNodes.length; ++i) {
            otherNodes[i].addMessageListener(updater(i))
        }

        // Produce data
        contactNode.publish('stream-id', 0, {
            hello: 'world'
        }, 100, 90)
        contactNode.publish('stream-id', 0, {
            foo: 'bar'
        }, 105, 100)
        await wait(2000)
    })

    afterAll(async () => {
        await callbackToPromise(contactNode.stop.bind(contactNode))
        await Promise.all(otherNodes.map((node) => callbackToPromise(node.stop.bind(node))))
        await callbackToPromise(tracker.stop.bind(tracker))
    })

    test('same message is emitted by a node exactly once', () => {
        expect(numOfReceivedMessages).toEqual([2, 2, 2, 2, 2])
    })

    test('maximum times a node receives duplicates of message is bounded by total number of repeaters', () => {
        const numOfDuplicates = otherNodes.map((n) => n.metrics.received.duplicates)
        expect(numOfDuplicates).toHaveLength(5)
        numOfDuplicates.forEach((n) => {
            expect(n).toBeLessThanOrEqual((otherNodes.length * 2)) // multiplier because 2 separate messages
        })
    })
})
