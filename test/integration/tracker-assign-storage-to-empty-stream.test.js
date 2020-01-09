const intoStream = require('into-stream')
const { waitForEvent, waitForCondition, waitForStreamToEnd } = require('streamr-test-utils')

const { startNetworkNode, startTracker, startStorageNode } = require('../../src/composition')
const TrackerServer = require('../../src/protocol/TrackerServer')
const TrackerNode = require('../../src/protocol/TrackerNode')
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
                {
                    timestamp: 756,
                    sequenceNo: 0,
                    previousTimestamp: 666,
                    previousSequenceNo: 50,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {},
                    signatureType: 0
                },
                {
                    timestamp: 800,
                    sequenceNo: 0,
                    previousTimestamp: 756,
                    previousSequenceNo: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {},
                    signatureType: 0
                },
                {
                    timestamp: 950,
                    sequenceNo: 0,
                    previousTimestamp: 800,
                    previousSequenceNo: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {},
                    signatureType: 0
                }
            ]),
            requestFrom: () => intoStream.object([
                {
                    timestamp: 666,
                    sequenceNo: 0,
                    publisherId: 'publisherId',
                    msgChainId: 'msgChainId',
                    data: {},
                    signatureType: 0
                }
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
        await waitForEvent(storageNode.protocols.trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)
        await waitForStreamToEnd(stream)
        expect(tracker.getTopology()).toEqual({
            'streamId::0': {
                storageNode: []
            }
        })

        const stream2 = subscriberTwo.requestResendLast('streamId2', 1, 'requestId2', 10)
        await waitForEvent(storageNode.protocols.trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)
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
        tracker = await startTracker(LOCALHOST, trackerPort, 'tracker')

        await Promise.all([
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED),
        ])

        await waitForCondition(() => Object.keys(tracker.getTopology()).length === 2)

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
