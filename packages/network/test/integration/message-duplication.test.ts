import { NetworkNode } from '../../src/NetworkNode'
import { Tracker } from '../../src/logic/Tracker'
import { StreamMessage, MessageID } from 'streamr-client-protocol'
import { waitForCondition } from 'streamr-test-utils'
import { createNetworkNode, startTracker } from '../../src/composition'

/**
 * This test verifies that on receiving a duplicate message, it is not re-emitted to the node's subscribers.
 */
describe('duplicate message detection and avoidance', () => {
    let tracker: Tracker
    let contactNode: NetworkNode
    let otherNodes: NetworkNode[]
    let numOfReceivedMessages: number[]

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30350,
            id: 'tracker'
        })
        contactNode = createNetworkNode({
            id: 'node-0',
            trackers: [tracker.getUrl()],
            stunUrls: []
        })
        contactNode.start()

        otherNodes = [
            createNetworkNode({
                id: 'node-1',
                trackers: [tracker.getUrl()],
                stunUrls: []
            }),
            createNetworkNode({
                id: 'node-2',
                trackers: [tracker.getUrl()],
                stunUrls: []
            }),
            createNetworkNode({
                id: 'node-3',
                trackers: [tracker.getUrl()],
                stunUrls: []
            }),
            createNetworkNode({
                id: 'node-4',
                trackers: [tracker.getUrl()],
                stunUrls: []
            }),
            createNetworkNode({
                id: 'node-5',
                trackers: [tracker.getUrl()],
                stunUrls: []
            }),
        ]

        otherNodes.forEach((n) => n.start())

        // Become subscribers (one-by-one, for well connected graph)
        otherNodes[0].subscribe('stream-id', 0)
        otherNodes[1].subscribe('stream-id', 0)
        otherNodes[2].subscribe('stream-id', 0)
        otherNodes[3].subscribe('stream-id', 0)
        otherNodes[4].subscribe('stream-id', 0)

        await Promise.all([
            otherNodes[0].waitForNeighbors('stream-id', 0, 2, 15 * 1000),
            otherNodes[1].waitForNeighbors('stream-id', 0, 2, 15 * 1000),
            otherNodes[2].waitForNeighbors('stream-id', 0, 2, 15 * 1000),
            otherNodes[3].waitForNeighbors('stream-id', 0, 2, 15 * 1000),
            otherNodes[4].waitForNeighbors('stream-id', 0, 2, 15 * 1000)
        ])

        // Set up 1st test case
        let totalMessages = 0
        numOfReceivedMessages = [0, 0, 0, 0, 0]
        const updater = (i: number) => () => {
            totalMessages += 1
            numOfReceivedMessages[i] += 1
        }
        for (let i = 0; i < otherNodes.length; ++i) {
            otherNodes[i].addMessageListener(updater(i))
        }

        // Produce data
        await contactNode.asyncPublish(new StreamMessage({
            messageId: new MessageID('stream-id', 0, 100, 0, 'publisher', 'session'),
            content: {
                hello: 'world'
            },
        }), 2)
        await contactNode.asyncPublish(new StreamMessage({
            messageId: new MessageID('stream-id', 0, 120, 0, 'publisher', 'session'),
            content: {
                hello: 'world'
            },
        }), 2)

        await waitForCondition(() => totalMessages > 9, 8000)
    }, 30 * 1000)

    afterAll(async () => {
        await Promise.allSettled([
            tracker.stop(),
            contactNode.stop(),
            otherNodes.map((node) => node.stop())
        ])
    })

    test('same message is emitted by a node exactly once', () => {
        expect(numOfReceivedMessages).toEqual([2, 2, 2, 2, 2])
    })

    test('maximum times a node receives duplicates of message is bounded by total number of repeaters', async () => {
        const numOfDuplicates = await Promise.all(otherNodes.map(async (n) => {
            // @ts-expect-error private field
            const report = await n.metrics.report()
            return (report['onDataReceived:ignoredDuplicate'] as any).total
        }))

        expect(numOfDuplicates).toHaveLength(5)
        numOfDuplicates.forEach((n) => {
            expect(n).toBeLessThanOrEqual((otherNodes.length * 2)) // multiplier because 2 separate messages
        })
    })
})
