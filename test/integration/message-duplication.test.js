const { StreamMessage, MessageID } = require('streamr-client-protocol').MessageLayer
const { waitForCondition, waitForEvent, wait } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const { Event: TrackerNodeEvent } = require('../../src/protocol/TrackerNode')

/**
 * This test verifies that on receiving a duplicate message, it is not re-emitted to the node's subscribers.
 */
describe('duplicate message detection and avoidance', () => {
    let tracker
    let contactNode
    let otherNodes
    let numOfReceivedMessages

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30350,
            id: 'tracker'
        })
        contactNode = await startNetworkNode({
            host: '127.0.0.1',
            port: 30351,
            id: 'node-0',
            trackers: [tracker.getAddress()]
        })
        contactNode.start()

        otherNodes = await Promise.all([
            startNetworkNode({
                host: '127.0.0.1',
                port: 30352,
                id: 'node-1',
                trackers: [tracker.getAddress()]
            }),
            startNetworkNode({
                host: '127.0.0.1',
                port: 30353,
                id: 'node-2',
                trackers: [tracker.getAddress()]
            }),
            startNetworkNode({
                host: '127.0.0.1',
                port: 30354,
                id: 'node-3',
                trackers: [tracker.getAddress()]
            }),
            startNetworkNode({
                host: '127.0.0.1',
                port: 30355,
                id: 'node-4',
                trackers: [tracker.getAddress()]
            }),
            startNetworkNode({
                host: '127.0.0.1',
                port: 30356,
                id: 'node-5',
                trackers: [tracker.getAddress()]
            }),
        ])

        const allNodesConnnectedToTrackerPromise = Promise.all(otherNodes.map((node) => {
            return waitForEvent(node.trackerNode, TrackerNodeEvent.CONNECTED_TO_TRACKER)
        }))
        // eslint-disable-next-line no-restricted-syntax
        for (const node of otherNodes) {
            node.start()
            // eslint-disable-next-line no-await-in-loop
            await wait(100) // do some sleep to prevent test from hanging
        }
        await allNodesConnnectedToTrackerPromise

        // Become subscribers (one-by-one, for well connected graph)
        otherNodes[0].subscribe('stream-id', 0)
        otherNodes[1].subscribe('stream-id', 0)
        otherNodes[2].subscribe('stream-id', 0)
        otherNodes[3].subscribe('stream-id', 0)
        otherNodes[4].subscribe('stream-id', 0)

        await wait(2000)

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
        contactNode.publish(new StreamMessage({
            messageId: new MessageID('stream-id', 0, 100, 0, 'publisher', 'session'),
            content: {
                hello: 'world'
            },
        }))
        contactNode.publish(new StreamMessage({
            messageId: new MessageID('stream-id', 0, 120, 0, 'publisher', 'session'),
            content: {
                hello: 'world'
            },
        }))

        await waitForCondition(() => totalMessages > 9, 8000)
    }, 10000)

    afterAll(async () => {
        await contactNode.stop()
        await Promise.all(otherNodes.map((node) => node.stop()))
        await tracker.stop()
    })

    test('same message is emitted by a node exactly once', () => {
        expect(numOfReceivedMessages).toEqual([2, 2, 2, 2, 2])
    })

    test('maximum times a node receives duplicates of message is bounded by total number of repeaters', async () => {
        const numOfDuplicates = await Promise.all(otherNodes.map(async (n) => {
            const report = await n.metrics.report()
            return report['onDataReceived:ignoredDuplicate'].total
        }))

        expect(numOfDuplicates).toHaveLength(5)
        numOfDuplicates.forEach((n) => {
            expect(n).toBeLessThanOrEqual((otherNodes.length * 2)) // multiplier because 2 separate messages
        })
    })
})
