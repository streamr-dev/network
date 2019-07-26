const { MessageLayer } = require('streamr-client-protocol')

const { startNetworkNode, startTracker } = require('../../src/composition')
const NetworkNode = require('../../src/NetworkNode')
const { LOCALHOST } = require('../util')

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
        tracker = await startTracker(LOCALHOST, 30320, 'tracker')

        sourceNode = await startNetworkNode(LOCALHOST, 30321, 'source-node')
        await sourceNode.addBootstrapTracker(tracker.getAddress())

        destinationNode = await startNetworkNode(LOCALHOST, 30322, 'destination-node')
        await destinationNode.addBootstrapTracker(tracker.getAddress())
    })

    afterAll(async () => {
        await sourceNode.stop()
        await destinationNode.stop()
        await tracker.stop()
    })

    test('first message to unknown stream eventually gets delivered', (done) => {
        destinationNode.on(NetworkNode.events.MESSAGE, (streamMessage) => {
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
        sourceNode.publish(
            'id',
            0,
            1,
            0,
            'publisher-id',
            'session-id',
            null,
            null,
            {
                hello: 'world'
            },
            StreamMessage.SIGNATURE_TYPES.NONE,
            null
        )
    })
})
