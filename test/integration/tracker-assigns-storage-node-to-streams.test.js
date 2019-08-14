const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const { waitForEvent } = require('streamr-test-utils')

const { startNetworkNode, startTracker, startStorageNode } = require('../../src/composition')
const Node = require('../../src/logic/Node')
const TrackerServer = require('../../src/protocol/TrackerServer')
const { LOCALHOST } = require('../util')

describe('tracker assigns storage node to streams', () => {
    let tracker
    let subscriberOne
    let subscriberTwo
    let storageNode

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 31950, 'tracker')
        storageNode = await startStorageNode(LOCALHOST, 31954, 'storageNode')
        subscriberOne = await startNetworkNode(LOCALHOST, 31952, 'subscriberOne')
        subscriberTwo = await startNetworkNode(LOCALHOST, 31953, 'subscriberTwo')

        subscriberOne.subscribe('stream-1', 0)
        subscriberTwo.subscribe('stream-2', 0)

        subscriberOne.addBootstrapTracker(tracker.getAddress())
        subscriberTwo.addBootstrapTracker(tracker.getAddress())

        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        storageNode.addBootstrapTracker(tracker.getAddress())
    })

    afterAll(async () => {
        await storageNode.stop()
        await subscriberOne.stop()
        await subscriberTwo.stop()
        await tracker.stop()
    })

    it('existing streams are assigned to storage node', async () => {
        subscriberOne.publish(StreamMessage.from({
            streamId: 'stream-1',
            streamPartition: 0,
            timestamp: 5,
            sequenceNumber: 0,
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            content: {},
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
        }))
        subscriberTwo.publish(StreamMessage.from({
            streamId: 'stream-2',
            streamPartition: 0,
            timestamp: 10,
            sequenceNumber: 0,
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            content: {},
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
        }))

        const [msg1] = await waitForEvent(storageNode, Node.events.UNSEEN_MESSAGE_RECEIVED)
        const [msg2] = await waitForEvent(storageNode, Node.events.UNSEEN_MESSAGE_RECEIVED)
        expect(msg1.getStreamId()).toEqual('stream-1')
        expect(msg2.getStreamId()).toEqual('stream-2')
    })

    it('new streams are assigned to storage node', async () => {
        subscriberOne.publish(StreamMessage.from({
            streamId: 'new-stream-1',
            streamPartition: 0,
            timestamp: 5,
            sequenceNumber: 0,
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            content: {},
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
        }))
        subscriberTwo.publish(StreamMessage.from({
            streamId: 'new-stream-2',
            streamPartition: 0,
            timestamp: 10,
            sequenceNumber: 0,
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            content: {},
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
        }))

        const [msg1] = await waitForEvent(storageNode, Node.events.UNSEEN_MESSAGE_RECEIVED)
        const [msg2] = await waitForEvent(storageNode, Node.events.UNSEEN_MESSAGE_RECEIVED)
        expect(msg1.getStreamId()).toEqual('new-stream-1')
        expect(msg2.getStreamId()).toEqual('new-stream-2')
    })
})
