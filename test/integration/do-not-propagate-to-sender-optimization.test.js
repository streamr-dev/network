const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const { wait, waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const { LOCALHOST } = require('../util')

/**
 * This test verifies that on receiving a message, the receiver will not propagate the message to the sender as they
 * obviously already know about the message.
 */
describe('optimization: do not propagate to sender', () => {
    let tracker
    let n1
    let n2
    let n3

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 30410, 'tracker')
        n1 = await startNetworkNode(LOCALHOST, 30411, 'node-1')
        n2 = await startNetworkNode(LOCALHOST, 30412, 'node-2')
        n3 = await startNetworkNode(LOCALHOST, 30413, 'node-3')

        await Promise.all([
            n1.addBootstrapTracker(tracker.getAddress()),
            n2.addBootstrapTracker(tracker.getAddress()),
            n3.addBootstrapTracker(tracker.getAddress())
        ])

        // Become subscribers (one-by-one, for well connected graph)
        n1.subscribe('stream-id', 0)
        n2.subscribe('stream-id', 0)
        n3.subscribe('stream-id', 0)

        await waitForEvent(n1, Node.events.NODE_SUBSCRIBED)
        await Promise.all([
            waitForEvent(n1, Node.events.NODE_SUBSCRIBED),
            waitForEvent(n2, Node.events.NODE_SUBSCRIBED)
        ])
    })

    afterAll(async () => {
        await n1.stop()
        await n2.stop()
        await n3.stop()
        await tracker.stop()
    })

    // In a fully-connected network the number of duplicates should be (n-1)(n-2) instead of (n-1)^2 when not
    // propagating received messages back to their source
    test('total duplicates == 2 in a fully-connected network of 3 nodes', async () => {
        n1.publish(StreamMessage.from({
            streamId: 'stream-id',
            streamPartition: 0,
            timestamp: 100,
            sequenceNumber: 0,
            publisherId: 'publisher',
            msgChainId: 'session',
            previousTimestamp: 99,
            previousSequenceNumber: 0,
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            content: {
                hello: 'world'
            },
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE
        }))
        await wait(250)

        expect(n1.metrics.get('onDataReceived:ignoring:duplicate')
            + n2.metrics.get('onDataReceived:ignoring:duplicate')
            + n3.metrics.get('onDataReceived:ignoring:duplicate'))
            .toEqual(2)
    })
})
