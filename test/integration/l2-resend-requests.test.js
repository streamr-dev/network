const intoStream = require('into-stream')
const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const { waitForStreamToEnd, waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')

const { ControlMessage } = ControlLayer
const { StreamMessage, MessageID, MessageRef } = MessageLayer

const typesOfStreamItems = async (stream) => {
    const arr = await waitForStreamToEnd(stream)
    return arr.map((msg) => msg.type)
}

/**
 * This test verifies that a node can fulfill resend requests at L2. A resend
 * request will be sent to contactNode. Being unable to fulfill the request,
 * it will forward it to its neighbors of which one or zero will be able to
 * fulfill it. Meanwhile contactNode will act as a proxy in between the
 * requesting client and neighbor nodes.
 */
describe('resend requests are fulfilled at L2', () => {
    let tracker
    let contactNode
    let n1
    let n2

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 28610,
            id: 'tracker'
        })
        contactNode = await startNetworkNode('127.0.0.1', 28611, 'contactNode', [{
            store: () => {},
            requestLast: () => intoStream.object([]),
            requestFrom: () => intoStream.object([]),
            requestRange: () => intoStream.object([]),
        }])
        n1 = await startNetworkNode('127.0.0.1', 28612, 'n1', [{
            store: () => {},
            requestLast: () => intoStream.object([
                new StreamMessage({
                    messageId: new MessageID('streamId', 0, 666, 50, 'publisherId', 'msgChainId'),
                    content: {},
                }),
            ]),
            requestFrom: () => intoStream.object([]),
            requestRange: () => intoStream.object([]),
        }])
        n2 = await startNetworkNode('127.0.0.1', 28613, 'n2', [{
            store: () => {},
            requestLast: () => intoStream.object([]),
            requestFrom: () => intoStream.object([
                new StreamMessage({
                    messageId: new MessageID('streamId', 0, 756, 0, 'publisherId', 'msgChainId'),
                    prevMsgRef: new MessageRef(666, 50),
                    content: {},
                }),
                new StreamMessage({
                    messageId: new MessageID('streamId', 0, 800, 0, 'publisherId', 'msgChainId'),
                    prevMsgRef: new MessageRef(756, 0),
                    content: {},
                }),
                new StreamMessage({
                    messageId: new MessageID('streamId', 0, 900, 0, 'publisherId', 'msgChainId'),
                    prevMsgRef: new MessageRef(800, 0),
                    content: {},
                }),
                new StreamMessage({
                    messageId: new MessageID('streamId', 0, 512012, 0, 'publisherId2', 'msgChainId'),
                    content: {},
                }),
            ]),
            requestRange: () => intoStream.object([]),
        }])

        n1.subscribe('streamId', 0)
        n2.subscribe('streamId', 0)
        contactNode.subscribe('streamId', 0)

        n1.addBootstrapTracker(tracker.getAddress())
        n2.addBootstrapTracker(tracker.getAddress())
        contactNode.addBootstrapTracker(tracker.getAddress())

        await Promise.all([
            waitForEvent(contactNode, Node.events.NODE_SUBSCRIBED),
            waitForEvent(n2, Node.events.NODE_SUBSCRIBED),
            waitForEvent(n1, Node.events.NODE_SUBSCRIBED)
        ])
    })

    afterEach(async () => {
        await contactNode.stop()
        await n1.stop()
        await n2.stop()
        await tracker.stop()
    })

    test('requestResendLast', async () => {
        const stream = contactNode.requestResendLast('streamId', 0, 'requestId', 10)
        const events = await typesOfStreamItems(stream)

        expect(events).toEqual([
            ControlMessage.TYPES.UnicastMessage,
        ])
    })

    test('requestResendFrom', async () => {
        const stream = contactNode.requestResendFrom(
            'streamId',
            0,
            'requestId',
            666,
            0,
            'publisherId',
            'msgChainId'
        )
        const events = await typesOfStreamItems(stream)

        expect(events).toEqual([
            ControlMessage.TYPES.UnicastMessage,
            ControlMessage.TYPES.UnicastMessage,
            ControlMessage.TYPES.UnicastMessage,
            ControlMessage.TYPES.UnicastMessage,
        ])
    })

    test('requestResendRange', async () => {
        const stream = contactNode.requestResendRange(
            'streamId',
            0,
            'requestId',
            666,
            0,
            999,
            0,
            'publisherId',
            'msgChainId'
        )
        const events = await typesOfStreamItems(stream)

        expect(events).toEqual([])
    })
})
