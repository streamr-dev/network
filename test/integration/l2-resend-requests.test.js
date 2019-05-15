const intoStream = require('into-stream')
const { startNetworkNode, startTracker } = require('../../src/composition')
const { eventsToArray, waitForEvent, wait, LOCALHOST } = require('../util')
const Node = require('../../src/logic/Node')
const NetworkNode = require('../../src/NetworkNode')

const collectNetworkNodeEvents = (node) => eventsToArray(node, Object.values(NetworkNode.events))

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

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 28610, 'tracker')
        contactNode = await startNetworkNode(LOCALHOST, 28611, 'contactNode', [{
            store: () => {},
            requestLast: () => intoStream.object([]),
            requestFrom: () => intoStream.object([]),
            requestRange: () => intoStream.object([]),
        }])
        n1 = await startNetworkNode(LOCALHOST, 28612, 'n1', [{
            store: () => {},
            requestLast: () => intoStream.object([
                {
                    timestamp: 666,
                    sequenceNo: 50,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {}
                },
            ]),
            requestFrom: () => intoStream.object([]),
            requestRange: () => intoStream.object([]),
        }])
        n2 = await startNetworkNode(LOCALHOST, 28613, 'n2', [{
            store: () => {},
            requestLast: () => intoStream.object([]),
            requestFrom: () => intoStream.object([
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
                },
                {
                    timestamp: 900,
                    sequenceNo: 0,
                    previousTimestamp: 800,
                    previousSequenceNo: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {}
                },
                {
                    timestamp: 512012,
                    sequenceNo: 0,
                    publisherId: 'publisherId2',
                    msgChainId: 'msgChainId',
                    data: {}
                }
            ]),
            requestRange: () => intoStream.object([]),
        }])

        contactNode.subscribe('streamId', 0)
        n1.subscribe('streamId', 0)
        n2.subscribe('streamId', 0)

        contactNode.addBootstrapTracker(tracker.getAddress())
        n1.addBootstrapTracker(tracker.getAddress())
        n2.addBootstrapTracker(tracker.getAddress())

        await Promise.all([
            waitForEvent(contactNode, Node.events.NODE_SUBSCRIBED),
            waitForEvent(n2, Node.events.NODE_SUBSCRIBED),
            waitForEvent(n1, Node.events.NODE_SUBSCRIBED)
        ])
    })

    afterAll(async () => {
        await contactNode.stop()
        await n1.stop()
        await n2.stop()
        await tracker.stop()
    })

    test('requestResendLast', async () => {
        const events = collectNetworkNodeEvents(contactNode)
        contactNode.requestResendLast('streamId', 0, 'subId', 10)

        await waitForEvent(contactNode, NetworkNode.events.RESENT)
        expect(events).toEqual([
            NetworkNode.events.RESENDING,
            NetworkNode.events.UNICAST,
            NetworkNode.events.RESENT,
        ])
    })

    test('requestResendFrom', async () => {
        const events = collectNetworkNodeEvents(contactNode)
        contactNode.requestResendFrom('streamId', 0, 'subId', 666, 0, 'publisherId', 'msgChainId')

        await waitForEvent(contactNode, NetworkNode.events.RESENT)
        expect(events).toEqual([
            NetworkNode.events.RESENDING,
            NetworkNode.events.UNICAST,
            NetworkNode.events.UNICAST,
            NetworkNode.events.UNICAST,
            NetworkNode.events.UNICAST,
            NetworkNode.events.RESENT,
        ])
    })

    test('requestResendRange', async () => {
        const events = collectNetworkNodeEvents(contactNode)
        contactNode.requestResendRange('streamId', 0, 'subId', 666, 0, 999, 0, 'publisherId', 'msgChainId')

        await waitForEvent(contactNode, NetworkNode.events.NO_RESEND)
        expect(events).toEqual([
            NetworkNode.events.NO_RESEND
        ])
    })
})
