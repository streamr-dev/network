const intoStream = require('into-stream')
const { StreamMessage, MessageID, MessageRef } = require('streamr-client-protocol').MessageLayer
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

        tracker = await startTracker({
            host: LOCALHOST, port: trackerPort, id: 'tracker'
        })
        subscriberOne = await startNetworkNode(LOCALHOST, await getPort(), 'subscriberOne')
        subscriberTwo = await startNetworkNode(LOCALHOST, await getPort(), 'subscriberTwo')

        storageNode = await startStorageNode(LOCALHOST, 18634, 'storageNode', [{
            store: () => {},
            requestLast: () => intoStream.object([
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
            ]),
            requestFrom: () => intoStream.object([
                new StreamMessage({
                    messageId: new MessageID('streamId', 0, 666, 0, 'publisherId', 'msgChainId'),
                    content: {},
                }),
            ]),
            requestRange: () => intoStream.object([]),
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

    afterAll(async () => {
        await storageNode.stop()
        await subscriberOne.stop()
        await subscriberTwo.stop()
        await tracker.stop()
    })

    it('tracker assigns storage node to any streams on any resend by default', async () => {
        expect(tracker.getTopology()).toEqual({})

        const stream = subscriberOne.requestResendLast('streamId', 0, 'requestId', 10)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.STORAGE_NODES_REQUEST)
        await waitForStreamToEnd(stream)

        expect(tracker.getTopology()).toEqual({
            'streamId::0': {
                storageNode: []
            }
        })

        const stream2 = subscriberTwo.requestResendLast('streamId2', 1, 'requestId2', 10)
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.STORAGE_NODES_REQUEST)
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
        tracker = await startTracker({
            host: LOCALHOST, port: trackerPort, id: 'tracker'
        })

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
