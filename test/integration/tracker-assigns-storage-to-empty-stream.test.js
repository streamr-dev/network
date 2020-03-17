const intoStream = require('into-stream')
const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const { waitForEvent, waitForCondition, waitForStreamToEnd } = require('streamr-test-utils')

const { startNetworkNode, startTracker, startStorageNode } = require('../../src/composition')
const TrackerServer = require('../../src/protocol/TrackerServer')
const { LOCALHOST, getPort } = require('../util')

describe('tracker assigns storage node to streams on any resend', () => {
    let tracker
    let trackerPort
    let subscriberOne
    let subscriberTwo
    let storageNode

    beforeAll(async () => {
        trackerPort = await getPort()

        tracker = await startTracker(LOCALHOST, trackerPort, 'tracker')
        subscriberOne = await startNetworkNode(LOCALHOST, await getPort(), 'subscriberOne')
        subscriberTwo = await startNetworkNode(LOCALHOST, await getPort(), 'subscriberTwo')

        storageNode = await startStorageNode(LOCALHOST, 18634, 'storageNode', [{
            store: () => {},
            requestLast: () => intoStream.object([
                StreamMessage.from({
                    streamId: 'streamId',
                    streamPartition: 0,
                    timestamp: 756,
                    sequenceNumber: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    previousTimestamp: 666,
                    previousSequenceNumber: 50,
                    contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                    encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                    content: {},
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE
                }),
                StreamMessage.from({
                    streamId: 'streamId',
                    streamPartition: 0,
                    timestamp: 800,
                    sequenceNumber: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    previousTimestamp: 756,
                    previousSequenceNumber: 0,
                    contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                    encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                    content: {},
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE
                }),
                StreamMessage.from({
                    streamId: 'streamId',
                    streamPartition: 0,
                    timestamp: 950,
                    sequenceNumber: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    previousTimestamp: 800,
                    previousSequenceNumber: 0,
                    contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                    encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                    content: {},
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE
                })
            ]),
            requestFrom: () => intoStream.object([
                StreamMessage.from({
                    streamId: 'streamId',
                    streamPartition: 0,
                    timestamp: 666,
                    sequenceNumber: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                    encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                    content: {},
                    signatureType: StreamMessage.SIGNATURE_TYPES.NONE
                })
            ]),
            requestRange: () => intoStream.object([]),
        }])

        subscriberOne.addBootstrapTracker(tracker.getAddress())
        subscriberTwo.addBootstrapTracker(tracker.getAddress())
        storageNode.addBootstrapTracker(tracker.getAddress())

        await Promise.all([
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
        ])
    })

    afterAll(async () => {
        await storageNode.stop()
        await subscriberOne.stop()
        await subscriberTwo.stop()
        await tracker.stop()
    })

    it('tracker assigns storage node to any streams on any resend by default', async () => {
        expect(tracker.getTopology()).toEqual({})

        const stream = subscriberOne.requestResendLast('streamId', 0, 'requestId', 10)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.FIND_STORAGE_NODES_REQUEST)
        await waitForStreamToEnd(stream)

        expect(tracker.getTopology()).toEqual({
            'streamId::0': {
                storageNode: []
            }
        })

        const stream2 = subscriberTwo.requestResendLast('streamId2', 1, 'requestId2', 10)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.FIND_STORAGE_NODES_REQUEST)
        await waitForStreamToEnd(stream2)

        expect(tracker.getTopology()).toEqual({
            'streamId::0': {
                storageNode: []
            },
            'streamId2::1': {
                storageNode: []
            }
        })

        await tracker.stop()
        // eslint-disable-next-line require-atomic-updates
        tracker = await startTracker(LOCALHOST, trackerPort, 'tracker')

        await waitForCondition(() => Object.keys(tracker.getTopology()).length === 2, 10000)

        expect(tracker.getTopology()).toEqual({
            'streamId::0': {
                storageNode: []
            },
            'streamId2::1': {
                storageNode: []
            }
        })
    }, 15000)
})
