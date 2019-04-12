const intoStream = require('into-stream')
const { startNetworkNode, startTracker } = require('../../src/composition')
const { callbackToPromise } = require('../../src/util')
const { eventsToArray, waitForEvent, LOCALHOST } = require('../util')
const Node = require('../../src/logic/Node')
const NetworkNode = require('../../src/NetworkNode')

jest.setTimeout(5000)

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
                    data: {}
                },
                {
                    timestamp: 756,
                    sequenceNo: 0,
                    previousTimestamp: 666,
                    previousSequenceNo: 50,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {}
                },
                {
                    timestamp: 800,
                    sequenceNo: 0,
                    previousTimestamp: 756,
                    previousSequenceNo: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {}
                }
            ]),
            requestFrom: () => intoStream.object([
                {
                    timestamp: 666,
                    sequenceNo: 50,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {}
                },
            ]),
            requestRange: () => intoStream.object([]),
        }])
        contactNode.addBootstrapTracker(tracker.getAddress())
        contactNode.subscribe('streamId', 0)
    })

    afterAll(async () => {
        await callbackToPromise(contactNode.stop.bind(contactNode))
        await callbackToPromise(tracker.stop.bind(tracker))
    })

    test('requestResendLast', async () => {
        const actualEvents = eventsToArray(contactNode, Object.values(NetworkNode.events))
        contactNode.requestResendLast('streamId', 0, 'subId', 10)

        await waitForEvent(contactNode, NetworkNode.events.RESENT)
        expect(actualEvents).toEqual([
            NetworkNode.events.RESENDING,
            NetworkNode.events.UNICAST,
            NetworkNode.events.UNICAST,
            NetworkNode.events.UNICAST,
            NetworkNode.events.RESENT,
        ])
    })

    test('requestResendFrom', async () => {
        const actualEvents = eventsToArray(contactNode, Object.values(NetworkNode.events))
        contactNode.requestResendFrom('streamId', 0, 'subId', 666, 0, 'publisherId')

        await waitForEvent(contactNode, NetworkNode.events.RESENT)
        expect(actualEvents).toEqual([
            NetworkNode.events.RESENDING,
            NetworkNode.events.UNICAST,
            NetworkNode.events.RESENT,
        ])
    })

    test('requestResendRange', async () => {
        const actualEvents = eventsToArray(contactNode, Object.values(NetworkNode.events))
        contactNode.requestResendRange('streamId', 0, 'subId', 666, 0, 999, 0, 'publisherId')

        await waitForEvent(contactNode, NetworkNode.events.NO_RESEND)
        expect(actualEvents).toEqual([
            NetworkNode.events.NO_RESEND
        ])
    })
})
