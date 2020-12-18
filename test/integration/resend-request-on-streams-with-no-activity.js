const { StreamMessage, MessageID, MessageRef } = require('streamr-client-protocol').MessageLayer
const { waitForEvent, waitForStreamToEnd, toReadableStream } = require('streamr-test-utils')

const { startNetworkNode, startTracker, startStorageNode } = require('../../src/composition')
const TrackerServer = require('../../src/protocol/TrackerServer')

describe('resend requests on streams with no activity', () => {
    let tracker
    let subscriberOne
    let subscriberTwo
    let storageNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 32904,
            id: 'tracker'
        })
        subscriberOne = await startNetworkNode('127.0.0.1', 32905, 'subscriberOne')
        subscriberTwo = await startNetworkNode('127.0.0.1', 32906, 'subscriberTwo')
        storageNode = await startStorageNode('127.0.0.1', 32907, 'storageNode', [{
            store: () => {},
            requestLast: () => toReadableStream(
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
            ),
            requestFrom: () => toReadableStream(
                new StreamMessage({
                    messageId: new MessageID('streamId', 0, 666, 0, 'publisherId', 'msgChainId'),
                    content: {},
                }),
            ),
            requestRange: () => toReadableStream(),
        }])

        storageNode.addBootstrapTracker(tracker.getAddress())
        subscriberOne.addBootstrapTracker(tracker.getAddress())
        subscriberTwo.addBootstrapTracker(tracker.getAddress())

        await Promise.all([
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
        ])
    })

    afterEach(async () => {
        await storageNode.stop()
        await subscriberOne.stop()
        await subscriberTwo.stop()
        await tracker.stop()
    })

    it('resend request works on streams that are not subscribed to', async () => {
        const stream = subscriberOne.requestResendLast('streamId', 0, 'requestId', 10)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.STORAGE_NODES_REQUEST)
        const data = await waitForStreamToEnd(stream)
        expect(data.length).toEqual(0)
    })
})
