const { StreamMessage, MessageID, MessageRef } = require('streamr-client-protocol').MessageLayer
const { waitForCondition, waitForEvent, wait } = require('streamr-test-utils')

const Node = require('../../src/logic/Node')
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
        n1 = await startNetworkNode({
            host: '127.0.0.1',
            port: 30411,
            id: 'node-1',
            trackers: [tracker.getAddress()]
        })
        n2 = await startNetworkNode({
            host: '127.0.0.1',
            port: 30412,
            id: 'node-2',
            trackers: [tracker.getAddress()]
        })
        n3 = await startNetworkNode({
            host: '127.0.0.1',
            port: 30413,
            id: 'node-3',
            trackers: [tracker.getAddress()]
        })

        n1.start()
        n2.start()
        n3.start()

        // Become subscribers (one-by-one, for well connected graph)
        n1.subscribe('stream-id', 0)
        n2.subscribe('stream-id', 0)
        n3.subscribe('stream-id', 0)

        // Wait for fully-connected network
        await waitForCondition(() => {
            return n1.getNeighbors().length === 2
                && n2.getNeighbors().length === 2
                && n3.getNeighbors().length === 2
        })
    })

    afterAll(async () => {
        await n1.stop()
        await n2.stop()
        await n3.stop()
        await tracker.stop()
    })

    // In a fully-connected network the number of duplicates should be (n-1)(n-2) instead of (n-1)^2 when not
    // propagating received messages back to their source
    test('total duplicates == 2 in a fully-connected network of 3 nodes', async (done) => {
        n1.publish(new StreamMessage({
            messageId: new MessageID('stream-id', 0, 100, 0, 'publisher', 'session'),
            prevMsgRef: new MessageRef(99, 0),
            content: {
                hello: 'world'
            },
        }))

        const checkFn = async () => {
            const reportN1 = await n1.metrics.report()
            const reportN2 = await n2.metrics.report()
            const reportN3 = await n3.metrics.report()

            const n1Duplicates = reportN1['onDataReceived:ignoredDuplicate'].total
            const n2Duplicates = reportN2['onDataReceived:ignoredDuplicate'].total
            const n3Duplicates = reportN3['onDataReceived:ignoredDuplicate'].total

            if (n1Duplicates + n2Duplicates + n3Duplicates > 0) {
                expect(n1Duplicates + n2Duplicates + n3Duplicates).toEqual(2)
                done()
            } else {
                setTimeout(checkFn, 150)
            }
        }
        setTimeout(checkFn, 150)
    })
})
