const { Readable } = require('stream')

const { StreamMessage, MessageID, MessageRef } = require('streamr-client-protocol').MessageLayer
const { waitForEvent, wait, toReadableStream } = require('streamr-test-utils')

const { startNetworkNode, startStorageNode, startTracker } = require('../../src/composition')
const { Event: NodeEvent } = require('../../src/logic/Node')
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
            host: '127.0.0.1',
            port: 28650,
            id: 'tracker'
        })
        contactNode = await startNetworkNode({
            host: '127.0.0.1',
            port: 28651,
            id: 'contactNode',
            trackers: [tracker.getAddress()],
            storages: [{
                store: () => {},
                requestLast: () => toReadableStream(),
                requestFrom: () => toReadableStream(),
                requestRange: () => toReadableStream(),
            }]
        })
        neighborOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 28652,
            id: 'neighborOne',
            trackers: [tracker.getAddress()],
            storages: [{
                store: () => {},
                requestLast: () => createSlowStream(),
                requestFrom: () => toReadableStream(),
                requestRange: () => toReadableStream(),
            }]
        })
        neighborTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 28653,
            id: 'neighborTwo',
            trackers: [tracker.getAddress()],
            storages: []
        })
        neighborThree = await startStorageNode({
            host: '127.0.0.1',
            port: 28654,
            id: 'neighborThree',
            trackers: [tracker.getAddress()],
            storages: [{
                store: () => {},
                requestLast: () => createSlowStream(),
                requestFrom: () => toReadableStream(),
                requestRange: () => toReadableStream(),
            }]
        })

        contactNode.subscribe('streamId', 0)
        neighborOne.subscribe('streamId', 0)
        neighborTwo.subscribe('streamId', 0)
        neighborThree.subscribe('streamId', 0)

        contactNode.start()
        neighborOne.start()
        neighborTwo.start()
        neighborThree.start()

        await Promise.all([
            waitForEvent(contactNode, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(neighborOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(neighborTwo, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(neighborThree, NodeEvent.NODE_SUBSCRIBED)
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
            waitForEvent(neighborOne, NodeEvent.RESEND_REQUEST_RECEIVED),
            waitForEvent(neighborTwo, NodeEvent.RESEND_REQUEST_RECEIVED),
            waitForEvent(neighborThree, NodeEvent.RESEND_REQUEST_RECEIVED),
        ])
        await contactNode.stop()
        return wait(500) // will throw if sending to non-connected address
    })
})
