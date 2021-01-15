import { NetworkNode } from '../NetworkNode'
import { Tracker } from '../logic/Tracker'
import { MessageLayer } from 'streamr-client-protocol'
import { waitForEvent, waitForStreamToEnd, toReadableStream } from 'streamr-test-utils'

import { startNetworkNode, startTracker, startStorageNode } from '../../src/composition'
import { Event } from '../../src/protocol/TrackerServer'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

describe('resend requests on streams with no activity', () => {
    let tracker: Tracker
    let subscriberOne: NetworkNode
    let subscriberTwo: NetworkNode
    let storageNode: NetworkNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 32904,
            id: 'tracker'
        })
        subscriberOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 32905,
            trackers: [tracker.getAddress()],
            id: 'subscriberOne'
        })
        subscriberTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 32906,
            trackers: [tracker.getAddress()],
            id: 'subscriberTwo'
        })
        storageNode = await startStorageNode({
            host: '127.0.0.1',
            port: 32907,
            trackers: [tracker.getAddress()],
            id: 'storageNode',
            storages: [{
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
            }]
        })

        subscriberOne.start()
        subscriberTwo.start()
        storageNode.start()

        await Promise.all([
            // @ts-expect-error private method
            waitForEvent(tracker.trackerServer, Event.NODE_STATUS_RECEIVED),
            // @ts-expect-error private method
            waitForEvent(tracker.trackerServer, Event.NODE_STATUS_RECEIVED),
            // @ts-expect-error private method
            waitForEvent(tracker.trackerServer, Event.NODE_STATUS_RECEIVED),
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
        // @ts-expect-error private method
        await waitForEvent(tracker.trackerServer, Event.STORAGE_NODES_REQUEST)
        const data = await waitForStreamToEnd(stream as any)
        expect(data.length).toEqual(3)
    })
})
