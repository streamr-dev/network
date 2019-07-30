const { waitForCondition, waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const { LOCALHOST } = require('../util')
const TrackerNode = require('../../src/protocol/TrackerNode')

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
        contactNode.addBootstrapTracker(tracker.getAddress())

        otherNodes = await Promise.all([
            startNetworkNode(LOCALHOST, 30352, 'node-1'),
            startNetworkNode(LOCALHOST, 30353, 'node-2'),
            startNetworkNode(LOCALHOST, 30354, 'node-3'),
            startNetworkNode(LOCALHOST, 30355, 'node-4'),
            startNetworkNode(LOCALHOST, 30356, 'node-5'),
        ])

        otherNodes.forEach((node) => node.addBootstrapTracker(tracker.getAddress()))
        await Promise.all(otherNodes.map((node) => waitForEvent(node.protocols.trackerNode, TrackerNode.events.CONNECTED_TO_TRACKER)))

        // Become subscribers (one-by-one, for well connected graph)
        otherNodes[0].subscribe('stream-id', 0)
        otherNodes[1].subscribe('stream-id', 0)
        otherNodes[2].subscribe('stream-id', 0)
        otherNodes[3].subscribe('stream-id', 0)
        otherNodes[4].subscribe('stream-id', 0)

        // Set up 1st test case
        let totalMessages = 0
        numOfReceivedMessages = [0, 0, 0, 0, 0]
        const updater = (i) => () => {
            totalMessages += 1
            numOfReceivedMessages[i] += 1
        }
        for (let i = 0; i < otherNodes.length; ++i) {
            otherNodes[i].addMessageListener(updater(i))
        }

        // Produce data
        contactNode.publish('stream-id', 0, 100, 0, 'publisher-id', 'session-id', 90, 0, {
            hello: 'world'
        })
        contactNode.publish('stream-id', 0, 120, 0, 'publisher-id', 'session-id', 100, 0, {
            foo: 'bar'
        })

        await waitForCondition(() => totalMessages > 9)
    })

    afterAll(async () => {
        await contactNode.stop()
        await Promise.all(otherNodes.map((node) => node.stop()))
        await tracker.stop()
    })

    test('same message is emitted by a node exactly once', () => {
        expect(numOfReceivedMessages).toEqual([2, 2, 2, 2, 2])
    })

    test('maximum times a node receives duplicates of message is bounded by total number of repeaters', () => {
        const numOfDuplicates = otherNodes.map((n) => n.metrics.get('received.duplicates'))
        expect(numOfDuplicates).toHaveLength(5)
        numOfDuplicates.forEach((n) => {
            expect(n).toBeLessThanOrEqual((otherNodes.length * 2)) // multiplier because 2 separate messages
        })
    })
})
