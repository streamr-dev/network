import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'

import { MessageLayer } from 'streamr-client-protocol'
import { waitForEvent } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from '../../src/logic/Node'

const { StreamMessage, MessageID } = MessageLayer

describe('node unsubscribing from a stream', () => {
    let tracker: Tracker
    let nodeA: NetworkNode
    let nodeB: NetworkNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30450,
            id: 'tracker'
        })
        nodeA = createNetworkNode({
            id: 'a',
            trackers: [tracker.getUrl()],
            disconnectionWaitTime: 200
        })
        nodeB = createNetworkNode({
            id: 'b',
            trackers: [tracker.getUrl()],
            disconnectionWaitTime: 200
        })

        nodeA.start()
        nodeB.start()

        nodeA.subscribe('s', 2)
        nodeB.subscribe('s', 2)
        await Promise.all([
            waitForEvent(nodeA, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeB, NodeEvent.NODE_SUBSCRIBED),
        ])

        nodeA.subscribe('s', 1)
        nodeB.subscribe('s', 1)
        await Promise.all([
            waitForEvent(nodeA, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeB, NodeEvent.NODE_SUBSCRIBED),
        ])
    })

    afterEach(async () => {
        await nodeA.stop()
        await nodeB.stop()
        await tracker.stop()
    })

    test('node still receives data for subscribed streams thru existing connections', async () => {
        const actual: string[] = []
        nodeB.addMessageListener((streamMessage) => {
            actual.push(`${streamMessage.getStreamId()}::${streamMessage.getStreamPartition()}`)
        })

        nodeB.unsubscribe('s', 2)
        await waitForEvent(nodeA, NodeEvent.NODE_UNSUBSCRIBED)

        nodeA.publish(new StreamMessage({
            messageId: new MessageID('s', 2, 0, 0, 'publisherId', 'msgChainId'),
            content: {},
        }))
        nodeA.publish(new StreamMessage({
            messageId: new MessageID('s', 1, 0, 0, 'publisherId', 'msgChainId'),
            content: {},
        }))
        await waitForEvent(nodeB, NodeEvent.UNSEEN_MESSAGE_RECEIVED)
        expect(actual).toEqual(['s::1'])
    })

    test('connection between nodes is not kept if no shared streams', async () => {
        nodeB.unsubscribe('s', 2)
        await waitForEvent(nodeA, NodeEvent.NODE_UNSUBSCRIBED)

        nodeA.unsubscribe('s', 1)
        await waitForEvent(nodeB, NodeEvent.NODE_UNSUBSCRIBED)

        const [aEventArgs, bEventArgs] = await Promise.all([
            waitForEvent(nodeA, NodeEvent.NODE_DISCONNECTED),
            waitForEvent(nodeB, NodeEvent.NODE_DISCONNECTED)
        ])

        expect(aEventArgs).toEqual(['b'])
        expect(bEventArgs).toEqual(['a'])
    })
})
