const { StreamMessage, MessageID, MessageRef } = require('streamr-client-protocol').MessageLayer
const { wait } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')

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
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30410,
            id: 'tracker'
        })
        n1 = await startNetworkNode('127.0.0.1', 30411, 'node-1')
        n2 = await startNetworkNode('127.0.0.1', 30412, 'node-2')
        n3 = await startNetworkNode('127.0.0.1', 30413, 'node-3')

        n1.addBootstrapTracker(tracker.getAddress())
        n2.addBootstrapTracker(tracker.getAddress())
        n3.addBootstrapTracker(tracker.getAddress())

        // Become subscribers (one-by-one, for well connected graph)
        n1.subscribe('stream-id', 0)
        n2.subscribe('stream-id', 0)
        n3.subscribe('stream-id', 0)

        await wait(1000)
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
        await wait(1000)
        n1.publish(new StreamMessage({
            messageId: new MessageID('stream-id', 0, 100, 0, 'publisher', 'session'),
            prevMsgRef: new MessageRef(99, 0),
            content: {
                hello: 'world'
            },
        }))
        await wait(250)

        expect(n1.metrics.get('onDataReceived:ignoring:duplicate')
            + n2.metrics.get('onDataReceived:ignoring:duplicate')
            + n3.metrics.get('onDataReceived:ignoring:duplicate'))
            .toEqual(2)
    })
})
