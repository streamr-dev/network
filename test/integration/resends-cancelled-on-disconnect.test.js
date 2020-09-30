const { Readable } = require('stream')

const { StreamMessage, MessageID, MessageRef } = require('streamr-client-protocol').MessageLayer
const intoStream = require('into-stream')
const { waitForEvent, wait } = require('streamr-test-utils')

const { startNetworkNode, startStorageNode, startTracker } = require('../../src/composition')
const { LOCALHOST } = require('../util')
const Node = require('../../src/logic/Node')
/**
 * This test verifies that a node does not attempt to send a resend response to
 * a node that previously requested a resend but then promptly disconnected.
 *
 * Flow (roughly):
 *  1. Node C connects to another node S
 *  2. Node C sends resend request to S
 *  3. Node C disconnects from node S
 *  4. Node S should  _not_ send a response to C anymore*
 */

const createSlowStream = () => {
    const messages = [
        new StreamMessage({
            messageId: new MessageID('streamId', 0, 756, 0, 'publisherId', 'msgChainId'),
            prevMsgRef: new MessageRef(666, 50),
            content: {},
        }),
        new StreamMessage({
            messageId: new MessageID('streamId', 0, 800, 0, 'publisherId', 'msgChainId'),
            prevMsgRef: new MessageRef(756, 0),
            content: {},
        }),
        new StreamMessage({
            messageId: new MessageID('streamId', 0, 950, 0, 'publisherId', 'msgChainId'),
            prevMsgRef: new MessageRef(800, 0),
            content: {},
        }),
    ]

    const stream = new Readable({
        objectMode: true,
        read() {}
    })

    for (let i = 0; i < messages.length; ++i) {
        setTimeout(() => stream.push(messages[i]), i * 100)
    }

    return stream
}

describe('resend cancellation on disconnect', () => {
    let tracker
    let contactNode
    let neighborOne
    let neighborTwo
    let neighborThree

    beforeAll(async () => {
        tracker = await startTracker({
            host: LOCALHOST, port: 28650, id: 'tracker'
        })
        contactNode = await startNetworkNode(LOCALHOST, 28651, 'contactNode', [{
            store: () => {},
            requestLast: () => intoStream.object([]),
            requestFrom: () => intoStream.object([]),
            requestRange: () => intoStream.object([]),
        }])
        neighborOne = await startNetworkNode(LOCALHOST, 28652, 'neighborOne', [{
            store: () => {},
            requestLast: () => createSlowStream(),
            requestFrom: () => intoStream.object([]),
            requestRange: () => intoStream.object([]),
        }])
        neighborTwo = await startNetworkNode(LOCALHOST, 28653, 'neighborTwo', [])
        neighborThree = await startStorageNode(LOCALHOST, 28654, 'neighborThree', [{
            store: () => {},
            requestLast: () => createSlowStream(),
            requestFrom: () => intoStream.object([]),
            requestRange: () => intoStream.object([]),
        }])

        contactNode.subscribe('streamId', 0)
        neighborOne.subscribe('streamId', 0)
        neighborTwo.subscribe('streamId', 0)
        neighborThree.subscribe('streamId', 0)

        contactNode.addBootstrapTracker(tracker.getAddress())
        neighborOne.addBootstrapTracker(tracker.getAddress())
        neighborTwo.addBootstrapTracker(tracker.getAddress())
        neighborThree.addBootstrapTracker(tracker.getAddress())

        await Promise.all([
            waitForEvent(contactNode, Node.events.NODE_SUBSCRIBED),
            waitForEvent(neighborOne, Node.events.NODE_SUBSCRIBED),
            waitForEvent(neighborTwo, Node.events.NODE_SUBSCRIBED),
            waitForEvent(neighborThree, Node.events.NODE_SUBSCRIBED)
        ])
    })

    afterAll(async () => {
        await tracker.stop()
        await contactNode.stop()
        await neighborOne.stop()
        await neighborTwo.stop()
        await neighborThree.stop()
    })

    test('nodes do not attempt to fulfill a resend request after requesting node disconnects', async () => {
        contactNode.requestResendLast('streamId', 0, 'subId', 10)
        await Promise.race([
            waitForEvent(neighborOne, Node.events.RESEND_REQUEST_RECEIVED),
            waitForEvent(neighborTwo, Node.events.RESEND_REQUEST_RECEIVED),
            waitForEvent(neighborThree, Node.events.RESEND_REQUEST_RECEIVED),
        ])
        await contactNode.stop()
        return wait(500) // will throw if sending to non-connected address
    })
})
