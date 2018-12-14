const { startNode, startTracker } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const { callbackToPromise } = require('../../src/util')
const { LOCALHOST, DEFAULT_TIMEOUT } = require('../util')

const DataMessage = require('../../src/messages/DataMessage')
const { StreamID, MessageID, MessageReference } = require('../../src/identifiers')

jest.setTimeout(DEFAULT_TIMEOUT)

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

        sourceNode = await startNode(LOCALHOST, 30321, 'source-node')
        await sourceNode.addBootstrapTracker(tracker.getAddress())

        destinationNode = await startNode(LOCALHOST, 30322, 'destination-node')
        await destinationNode.addBootstrapTracker(tracker.getAddress())
    })

    afterAll(async () => {
        await callbackToPromise(sourceNode.stop.bind(sourceNode))
        await callbackToPromise(destinationNode.stop.bind(destinationNode))
        await callbackToPromise(tracker.stop.bind(tracker))
    })

    test('first message to unknown stream eventually gets delivered', (done) => {
        destinationNode.on(Node.events.MESSAGE_RECEIVED, (dataMessage) => {
            expect(dataMessage.getMessageId()).toEqual(new MessageID(new StreamID('id', 0), 1, 0, 'publisher-id'))
            expect(dataMessage.getData()).toEqual({
                hello: 'world'
            })
            done()
        })

        destinationNode.subscribeToStreamIfHaveNotYet(new StreamID('id', 0))

        // "Client" pushes data
        const dataMessage = new DataMessage(
            new MessageID(new StreamID('id', 0), 1, 0, 'publisher-id'),
            new MessageReference(0, 0),
            {
                hello: 'world'
            }
        )
        sourceNode.onDataReceived(dataMessage)
    })
})
