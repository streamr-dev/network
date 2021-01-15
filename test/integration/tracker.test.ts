import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { waitForEvent, waitForCondition } from 'streamr-test-utils'

import { startNetworkNode, startTracker } from '../../src/composition'
import { Node, Event as NodeEvent } from '../../src/logic/Node'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { getTopology } from '../../src/logic/trackerSummaryUtils'

describe('check tracker, nodes and statuses from nodes', () => {
    let tracker: Tracker
    let subscriberOne: NetworkNode
    let subscriberTwo: NetworkNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 32400,
            id: 'tracker'
        })
        subscriberOne = await startNetworkNode({
            host: '127.0.0.1',
            port: 33371,
            id: 'subscriberOne',
            trackers: [tracker.getAddress()]
        })
        subscriberTwo = await startNetworkNode({
            host: '127.0.0.1',
            port: 33372,
            id: 'subscriberTwo',
            trackers: [tracker.getAddress()]
        })

        subscriberOne.subscribe('stream-1', 0)
        subscriberOne.subscribe('stream-2', 2)

        subscriberTwo.subscribe('stream-1', 0)
        subscriberTwo.subscribe('stream-2', 2)
    })

    afterEach(async () => {
        await subscriberOne.stop()
        await subscriberTwo.stop()
        await tracker.stop()
    })

    it('should be able to start two nodes, receive statuses, subscribe to streams', async () => {
        subscriberOne.start()
        // @ts-expect-error private field
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        expect(getTopology(tracker.getOverlayPerStream())).toEqual({
            'stream-1::0': {
                subscriberOne: [],
            },
            'stream-2::2': {
                subscriberOne: []
            }
        })

        subscriberTwo.start()
        // @ts-expect-error private field
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        expect(getTopology(tracker.getOverlayPerStream())).toEqual({
            'stream-1::0': {
                subscriberOne: ['subscriberTwo'],
                subscriberTwo: ['subscriberOne']
            },
            'stream-2::2': {
                subscriberOne: ['subscriberTwo'],
                subscriberTwo: ['subscriberOne']
            }
        })
    })

    it('tracker should update correctly overlays on subscribe/unsubscribe', async () => {
        subscriberOne.start()
        subscriberTwo.start()

        await Promise.all([
            waitForEvent(subscriberOne, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(subscriberTwo, NodeEvent.NODE_SUBSCRIBED)
        ])
        // @ts-expect-error private field
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)

        subscriberOne.unsubscribe('stream-2', 2)
        await waitForEvent(subscriberTwo, NodeEvent.NODE_UNSUBSCRIBED)
        // @ts-expect-error private field
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        expect(getTopology(tracker.getOverlayPerStream())).toEqual({
            'stream-1::0': {
                subscriberOne: ['subscriberTwo'],
                subscriberTwo: ['subscriberOne'],
            },
            'stream-2::2': {
                subscriberTwo: []
            }
        })

        subscriberOne.unsubscribe('stream-1', 0)
        await waitForEvent(subscriberTwo, NodeEvent.NODE_UNSUBSCRIBED)
        // @ts-expect-error private field
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        expect(getTopology(tracker.getOverlayPerStream())).toEqual({
            'stream-1::0': {
                subscriberTwo: [],
            },
            'stream-2::2': {
                subscriberTwo: []
            }
        })

        subscriberTwo.unsubscribe('stream-1', 0)
        await waitForCondition(() => getTopology(tracker.getOverlayPerStream())['stream-1::0'] == null)
        expect(getTopology(tracker.getOverlayPerStream())).toEqual({
            'stream-2::2': {
                subscriberTwo: []
            }
        })

        subscriberTwo.unsubscribe('stream-2', 2)
        // @ts-expect-error private field
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)
        expect(getTopology(tracker.getOverlayPerStream())).toEqual({})
    }, 10 * 1000)
})
