const intoStream = require('into-stream')
const { UnicastMessage } = require('streamr-client-protocol').ControlLayer
const { waitForStreamToEnd } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const { LOCALHOST } = require('../util')

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

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 28600, 'tracker')
        contactNode = await startNetworkNode(LOCALHOST, 28601, 'contactNode', [{
            store: () => {},
            requestLast: () => intoStream.object([
                {
                    timestamp: 666,
                    sequenceNo: 50,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {},
                    signatureType: 0
                },
                {
                    timestamp: 756,
                    sequenceNo: 0,
                    previousTimestamp: 666,
                    previousSequenceNo: 50,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {},
                    signatureType: 0
                },
                {
                    timestamp: 800,
                    sequenceNo: 0,
                    previousTimestamp: 756,
                    previousSequenceNo: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {},
                    signatureType: 0
                }
            ]),
            requestFrom: () => intoStream.object([
                {
                    timestamp: 666,
                    sequenceNo: 50,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {},
                    signatureType: 0
                },
            ]),
            requestRange: () => intoStream.object([]),
        }])
        contactNode.addBootstrapTracker(tracker.getAddress())
        contactNode.subscribe('streamId', 0)
    })

    afterAll(async () => {
        await contactNode.stop()
        await tracker.stop()
    })

    test('requestResendLast', async () => {
        const stream = contactNode.requestResendLast('streamId', 0, 'subId', 10)
        const events = await typesOfStreamItems(stream)

        expect(events).toEqual([
            UnicastMessage.TYPE,
            UnicastMessage.TYPE,
            UnicastMessage.TYPE,
        ])
    })

    test('requestResendFrom', async () => {
        const stream = contactNode.requestResendFrom(
            'streamId',
            0,
            'subId',
            666,
            0,
            'publisherId',
            'msgChainId'
        )
        const events = await typesOfStreamItems(stream)

        expect(events).toEqual([
            UnicastMessage.TYPE,
        ])
    })

    test('requestResendRange', async () => {
        const stream = contactNode.requestResendRange(
            'streamId',
            0,
            'subId',
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
