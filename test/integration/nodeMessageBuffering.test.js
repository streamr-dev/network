const { MessageLayer } = require('streamr-client-protocol')
const { wait } = require('streamr-test-utils')

const { startNetworkNode, startTracker } = require('../../src/composition')

const { StreamMessage, MessageID } = MessageLayer

/**
 * When a node receives a message for a stream it hasn't still subscribed to, it
 * subscribes to the stream and then asks the tracker who else is participating
 * in the stream. In this test we verify that the initial message that causes
 * this whole process is itself eventually delivered.
 */
describe('message buffering of Node', () => {
    let tracker
    let sourceNode
    let destinationNode

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 30320,
            id: 'tracker'
        })

        sourceNode = await startNetworkNode({
            host: '127.0.0.1',
            port: 30321,
            id: 'source-node',
            trackers: [tracker.getAddress()]
        })
        destinationNode = await startNetworkNode({
            host: '127.0.0.1',
            port: 30322,
            id: 'destination-node',
            trackers: [tracker.getAddress()]
        })

        sourceNode.start()
        destinationNode.start()
    })

    afterAll(async () => {
        await sourceNode.stop()
        await destinationNode.stop()
        await tracker.stop()
    })

    test('first message to unknown stream eventually gets delivered', (done) => {
        destinationNode.addMessageListener((streamMessage) => {
            expect(streamMessage.messageId).toEqual(
                new MessageID('id', 0, 1, 0, 'publisher-id', 'session-id')
            )
            expect(streamMessage.getParsedContent()).toEqual({
                hello: 'world'
            })
            done()
        })

        destinationNode.subscribe('id', 0)

        // "Client" pushes data
        sourceNode.publish(new StreamMessage({
            messageId: new MessageID('id', 0, 1, 0, 'publisher-id', 'session-id'),
            content: {
                hello: 'world'
            },
        }))
    })
})
