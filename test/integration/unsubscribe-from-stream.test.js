const { StreamMessage, MessageID } = require('streamr-client-protocol').MessageLayer
const { waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const TrackerServer = require('../../src/protocol/TrackerServer')

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
            trackers: [tracker.getAddress()]
        })
        nodeB = await startNetworkNode({
            host: '127.0.0.1',
            port: 30452,
            id: 'b',
            trackers: [tracker.getAddress()]
        })

        // TODO: a better way of achieving this would be to pass via constructor, but currently not possible when using
        // startNetworkNode function
        nodeA.opts.disconnectionWaitTime = 200
        nodeB.opts.disconnectionWaitTime = 200

        nodeA.subscribe('s', 1)
        nodeB.subscribe('s', 1)
        nodeA.subscribe('s', 2)
        nodeB.subscribe('s', 2)

        nodeA.start()
        nodeB.start()

        await Promise.all([
            waitForEvent(nodeA, Node.events.NODE_SUBSCRIBED),
            waitForEvent(nodeB, Node.events.NODE_SUBSCRIBED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
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
        await waitForEvent(nodeA, Node.events.NODE_UNSUBSCRIBED)

        nodeA.publish(new StreamMessage({
            messageId: new MessageID('s', 2, 0, 0, 'publisherId', 'msgChainId'),
            content: {},
        }))
        nodeA.publish(new StreamMessage({
            messageId: new MessageID('s', 1, 0, 0, 'publisherId', 'msgChainId'),
            content: {},
        }))
        await waitForEvent(nodeB, Node.events.UNSEEN_MESSAGE_RECEIVED)
        expect(actual).toEqual(['s::1'])
    })

    test('connection between nodes is not kept if no shared streams', async () => {
        nodeB.unsubscribe('s', 2)
        await waitForEvent(nodeA, Node.events.NODE_UNSUBSCRIBED)

        nodeA.unsubscribe('s', 1)
        await waitForEvent(nodeB, Node.events.NODE_UNSUBSCRIBED)

        const [aEventArgs, bEventArgs] = await Promise.all([
            waitForEvent(nodeA, Node.events.NODE_DISCONNECTED),
            waitForEvent(nodeB, Node.events.NODE_DISCONNECTED)
        ])

        expect(aEventArgs).toEqual(['b'])
        expect(bEventArgs).toEqual(['a'])
    })
})
