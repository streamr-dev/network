import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { Tracker } from '../../src/logic/tracker/Tracker'
import { MessageLayer } from 'streamr-client-protocol'
import { waitForCondition, waitForEvent } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from "../../src/logic/node/Node"

const { StreamMessage, MessageID } = MessageLayer

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
            listen: {
                hostname: '127.0.0.1',
                port: 30350
            }
        })
        const trackerInfo = tracker.getConfigRecord()
        contactNode = createNetworkNode({
            id: 'node-0',
            trackers: [trackerInfo],
            stunUrls: []
        })
        contactNode.start()

        otherNodes = [
            createNetworkNode({
                id: 'node-1',
                trackers: [trackerInfo],
                stunUrls: []
            }),
            createNetworkNode({
                id: 'node-2',
                trackers: [trackerInfo],
                stunUrls: []
            }),
            createNetworkNode({
                id: 'node-3',
                trackers: [trackerInfo],
                stunUrls: []
            }),
            createNetworkNode({
                id: 'node-4',
                trackers: [trackerInfo],
                stunUrls: []
            }),
            createNetworkNode({
                id: 'node-5',
                trackers: [trackerInfo],
                stunUrls: []
            }),
        ]

        // eslint-disable-next-line no-restricted-syntax
        for (const node of otherNodes) {
            node.start()
        }

        const allNodesSubscribed = Promise.all(otherNodes.map((node) => {
            return waitForEvent(node, NodeEvent.NODE_SUBSCRIBED)
        }))
        // Become subscribers (one-by-one, for well connected graph)
        otherNodes[0].subscribe('stream-id', 0)
        otherNodes[1].subscribe('stream-id', 0)
        otherNodes[2].subscribe('stream-id', 0)
        otherNodes[3].subscribe('stream-id', 0)
        otherNodes[4].subscribe('stream-id', 0)

        await allNodesSubscribed

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
