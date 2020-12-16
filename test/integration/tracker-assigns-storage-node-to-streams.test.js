const { StreamMessage, MessageID } = require('streamr-client-protocol').MessageLayer
const { waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker, startStorageNode } = require('../../src/composition')
const { Event: NodeEvent } = require('../../src/logic/Node')

describe('tracker assigns storage node to streams', () => {
    let tracker
    let subscriberOne
    let subscriberTwo
    let storageNode

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 31950,
            id: 'tracker',
        })
        storageNode = await startStorageNode({
            host: '127.0.0.1',
            port: 31951,
            id: 'storageNode',
            trackers: [tracker.getAddress()]
        })
        subscriberOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 31952,
            id: 'subscriberOne',
            trackers: [tracker.getAddress()]
        })
        subscriberTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 31953,
            id: 'subscriberTwo',
            trackers: [tracker.getAddress()]
        })

        subscriberOne.subscribe('stream-1', 0)
        subscriberTwo.subscribe('stream-2', 0)

        subscriberOne.start()
        subscriberTwo.start()
        storageNode.start()
    })

    afterAll(async () => {
        await storageNode.stop()
        await subscriberOne.stop()
        await subscriberTwo.stop()
        await tracker.stop()
    })

    it('existing streams are assigned to storage node', async () => {
        subscriberOne.publish(new StreamMessage({
            messageId: new MessageID('stream-1', 0, 5, 0, 'publisherId', 'msgChainId'),
            content: {},
        }))

        const [msg1] = await waitForEvent(storageNode, NodeEvent.UNSEEN_MESSAGE_RECEIVED)

        subscriberTwo.publish(new StreamMessage({
            messageId: new MessageID('stream-2', 0, 10, 0, 'publisherId', 'msgChainId'),
            content: {},
        }))

        const [msg2] = await waitForEvent(storageNode, NodeEvent.UNSEEN_MESSAGE_RECEIVED)
        expect(msg1.getStreamId()).toEqual('stream-1')
        expect(msg2.getStreamId()).toEqual('stream-2')
    })

    it('new streams are assigned to storage node', async () => {
        subscriberOne.publish(new StreamMessage({
            messageId: new MessageID('new-stream-1', 0, 5, 0, 'publisherId', 'msgChainId'),
            content: {},
        }))
        const [msg1] = await waitForEvent(storageNode, NodeEvent.UNSEEN_MESSAGE_RECEIVED)

        subscriberTwo.publish(new StreamMessage({
            messageId: new MessageID('new-stream-2', 0, 10, 0, 'publisherId', 'msgChainId'),
            content: {},
        }))
        const [msg2] = await waitForEvent(storageNode, NodeEvent.UNSEEN_MESSAGE_RECEIVED)

        expect(msg1.getStreamId()).toEqual('new-stream-1')
        expect(msg2.getStreamId()).toEqual('new-stream-2')
    })
})
