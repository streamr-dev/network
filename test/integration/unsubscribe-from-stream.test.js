const { StreamMessage, MessageID } = require('streamr-client-protocol').MessageLayer
const { waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const { Event: NodeEvent } = require('../../src/logic/Node')
const { Event: TrackerServerEvent } = require('../../src/protocol/TrackerServer')

describe('node unsubscribing from a stream', () => {
    let tracker
    let nodeA
    let nodeB

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30450,
            id: 'tracker'
        })
        nodeA = await startNetworkNode({
            host: '127.0.0.1',
            port: 30451,
            id: 'a',
            trackers: [tracker.getAddress()],
            disconnectionWaitTime: 200
        })
        nodeB = await startNetworkNode({
            host: '127.0.0.1',
            port: 30452,
            id: 'b',
            trackers: [tracker.getAddress()],
            disconnectionWaitTime: 200
        })

        nodeA.subscribe('s', 1)
        nodeB.subscribe('s', 1)
        nodeA.subscribe('s', 2)
        nodeB.subscribe('s', 2)

        nodeA.start()
        nodeB.start()

        await Promise.all([
            waitForEvent(nodeA, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(nodeB, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        ])
    })

    afterEach(async () => {
        await nodeA.stop()
        await nodeB.stop()
        await tracker.stop()
    })

    test('node still receives data for subscribed streams thru existing connections', async () => {
        const actual = []

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
