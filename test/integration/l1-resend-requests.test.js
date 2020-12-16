const intoStream = require('into-stream')
const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const { waitForEvent, waitForStreamToEnd } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const { Event: TrackerServerEvent } = require('../../src/protocol/TrackerServer')

const { ControlMessage } = ControlLayer
const { StreamMessage, MessageID, MessageRef } = MessageLayer

const typesOfStreamItems = async (stream) => {
    const arr = await waitForStreamToEnd(stream)
    return arr.map((msg) => msg.type)
}

/**
 * This test verifies that a node can fulfill resend requests at L1. This means
 * that the node
 *      a) understands and handles resend requests,
 *      b) can respond with resend responses, and finally,
 *      c) uses its local storage to find messages.
 */
describe('resend requests are fulfilled at L1', () => {
    let tracker
    let contactNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 28600,
            id: 'tracker'
        })
        contactNode = await startNetworkNode({
            host: '127.0.0.1',
            port: 28601,
            id: 'contactNode',
            trackers: [tracker.getAddress()],
            storages: [{
                store: () => {},
                requestLast: () => intoStream.object([
                    new StreamMessage({
                        messageId: new MessageID('streamId', 0, 666, 50, 'publisherId', 'msgChainId'),
                        content: {},
                    }),
                    new StreamMessage({
                        messageId: new MessageID('streamId', 0, 756, 0, 'publisherId', 'msgChainId'),
                        prevMsgRef: new MessageRef(666, 50),
                        content: {},
                    }),
                    new StreamMessage({
                        messageId: new MessageID('streamId', 0, 800, 0, 'publisherId', 'msgChainId'),
                        prevMsgRef: new MessageRef(756, 0),
                        content: {},
                    })
                ]),
                requestFrom: () => intoStream.object([
                    new StreamMessage({
                        messageId: new MessageID('streamId', 0, 666, 50, 'publisherId', 'msgChainId'),
                        content: {},
                    }),
                ]),
                requestRange: () => intoStream.object([]),
            }]
        })
        contactNode.start()
        contactNode.subscribe('streamId', 0)

        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
    })

    afterEach(async () => {
        await contactNode.stop()
        await tracker.stop()
    })

    test('requestResendLast', async () => {
        const stream = contactNode.requestResendLast('streamId', 0, 'requestId', 10)
        const events = await typesOfStreamItems(stream)

        expect(events).toEqual([
            ControlMessage.TYPES.UnicastMessage,
            ControlMessage.TYPES.UnicastMessage,
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
