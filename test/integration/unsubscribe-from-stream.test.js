const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const { wait, waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const { LOCALHOST } = require('../util')

describe('node unsubscribing from a stream', () => {
    let tracker
    let nodeA
    let nodeB

    beforeEach(async () => {
        tracker = await startTracker(LOCALHOST, 30450, 'tracker')
        nodeA = await startNetworkNode(LOCALHOST, 30451, 'a')
        nodeB = await startNetworkNode(LOCALHOST, 30452, 'b')

        nodeA.addBootstrapTracker(tracker.getAddress())
        nodeB.addBootstrapTracker(tracker.getAddress())

        nodeA.subscribe('s', 1)
        nodeB.subscribe('s', 1)

        await wait(500)

        nodeA.subscribe('s', 2)
        nodeB.subscribe('s', 2)

        await wait(500)

        await waitForEvent(nodeB, Node.events.NODE_SUBSCRIBED)
        await waitForEvent(nodeA, Node.events.NODE_SUBSCRIBED)
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

        nodeA.publish(StreamMessage.from({
            streamId: 's',
            streamPartition: 2,
            timestamp: 0,
            sequenceNumber: 0,
            publisherId: '',
            msgChainId: '',
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            content: {},
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE
        }))
        nodeA.publish(StreamMessage.from({
            streamId: 's',
            streamPartition: 1,
            timestamp: 0,
            sequenceNumber: 0,
            publisherId: '',
            msgChainId: '',
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            content: {},
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE
        }))

        await wait(150)

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
