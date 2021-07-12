import { NetworkNode } from '../../src/NetworkNode'
import { Tracker } from '../../src/logic/Tracker'
import { MessageLayer } from 'streamr-client-protocol'
import { waitForCondition } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

/**
 * This test verifies that on receiving a message, the receiver will not propagate the message to the sender as they
 * obviously already know about the message.
 */
describe('optimization: do not propagate to sender', () => {
    let tracker: Tracker
    let n1: NetworkNode
    let n2: NetworkNode
    let n3: NetworkNode

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30410,
            id: 'tracker'
        })
        const trackerInfo = { id: 'tracker', ws: tracker.getUrl(), http: tracker.getUrl() }
        n1 = createNetworkNode({
            id: 'node-1',
            trackers: [trackerInfo]
        })
        n2 = createNetworkNode({
            id: 'node-2',
            trackers: [trackerInfo]
        })
        n3 = createNetworkNode({
            id: 'node-3',
            trackers: [trackerInfo]
        })

        n1.start()
        n2.start()
        n3.start()

        // Become subscribers (one-by-one, for well connected graph)
        n1.subscribe('stream-id', 0)
        n2.subscribe('stream-id', 0)
        n3.subscribe('stream-id', 0)

        // Wait for fully-connected network
        await waitForCondition(() => {
            return n1.getNeighbors().length === 2
                && n2.getNeighbors().length === 2
                && n3.getNeighbors().length === 2
        })
    })

    afterAll(async () => {
        await Promise.allSettled([
            tracker.stop(),
            n1.stop(),
            n2.stop(),
            n3.stop()
        ])
    })

    // In a fully-connected network the number of duplicates should be (n-1)(n-2) instead of (n-1)^2 when not
    // propagating received messages back to their source
    test('total duplicates == 2 in a fully-connected network of 3 nodes', async () => {
        n1.publish(new StreamMessage({
            messageId: new MessageID('stream-id', 0, 100, 0, 'publisher', 'session'),
            prevMsgRef: new MessageRef(99, 0),
            content: {
                hello: 'world'
            },
        }))

        let n1Duplicates = 0
        let n2Duplicates = 0
        let n3Duplicates = 0

        await waitForCondition(async () => {
            // @ts-expect-error private variable
            const reportN1 = await n1.metrics.report()
            // @ts-expect-error private variable
            const reportN2 = await n2.metrics.report()
            // @ts-expect-error private variable
            const reportN3 = await n3.metrics.report()

            n1Duplicates = (reportN1['onDataReceived:ignoredDuplicate'] as any).total
            n2Duplicates = (reportN2['onDataReceived:ignoredDuplicate'] as any).total
            n3Duplicates = (reportN3['onDataReceived:ignoredDuplicate'] as any).total

            return n1Duplicates + n2Duplicates + n3Duplicates > 0
        })

        expect(n1Duplicates + n2Duplicates + n3Duplicates).toEqual(2)
    })
})
