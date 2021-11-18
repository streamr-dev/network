import { Tracker } from '../../src/logic/tracker/Tracker'
import { NetworkNode } from '../../src/logic/node/NetworkNode'
import { runAndWaitForEvents, runAndWaitForConditions } from 'streamr-test-utils'

import { createNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from '../../src/logic/node/Node'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { getTopology } from '../../src/logic/tracker/trackerSummaryUtils'

describe('check tracker, nodes and statuses from nodes', () => {
    let tracker: Tracker
    let subscriberOne: NetworkNode
    let subscriberTwo: NetworkNode

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 32400
            },
            id: 'tracker'
        })

        const trackerInfo = tracker.getConfigRecord()

        subscriberOne = createNetworkNode({
            id: 'subscriberOne',
            trackers: [trackerInfo]
        })
        subscriberTwo = createNetworkNode({
            id: 'subscriberTwo',
            trackers: [trackerInfo]
        })

        subscriberOne.start()
        subscriberTwo.start()

        subscriberOne.subscribe('stream-2', 2)

        await runAndWaitForEvents([ () => { subscriberOne.subscribe('stream-1', 0) }, 
            () => { subscriberTwo.subscribe('stream-1', 0) }],[
            [subscriberOne, NodeEvent.NODE_SUBSCRIBED],
            [subscriberTwo, NodeEvent.NODE_SUBSCRIBED],
            // @ts-expect-error private field
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        ])

        await runAndWaitForEvents([ () => { subscriberOne.subscribe('stream-2', 2) }, 
            () => { subscriberTwo.subscribe('stream-2', 2) }],[
            [subscriberOne, NodeEvent.NODE_SUBSCRIBED],
            [subscriberTwo, NodeEvent.NODE_SUBSCRIBED],
            // @ts-expect-error private field
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        ])
    })

    afterEach(async () => {
        await subscriberOne.stop()
        await subscriberTwo.stop()
        await tracker.stop()
    })

    /*
    it('has id & peerInfo', async () => {
        expect(tracker.getTrackerId()).toEqual(tracker.peerInfo.peerId)
        expect(tracker.peerInfo.isTracker()).toEqual(true)
        expect(tracker.peerInfo.isNode()).toEqual(false)
    })

    it('should be able to start two nodes, receive statuses, subscribe to streams', async () => {
        // @ts-expect-error private field
        await runAndWaitForEvents(() => {subscriberOne.start()}, [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED])
        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual({
            'stream-1#0': {
                subscriberOne: [],
            },
            'stream-2#2': {
                subscriberOne: []
            }
        })

        // @ts-expect-error private field
        await runAndWaitForEvents(()=> { subscriberTwo.start() }, [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED])
        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual({
            'stream-1#0': {
                subscriberOne: [{neighborId: 'subscriberTwo', rtt: null}],
                subscriberTwo: [{neighborId: 'subscriberOne', rtt: null}]
            },
            'stream-2#2': {
                subscriberOne: [{neighborId: 'subscriberTwo', rtt: null}],
                subscriberTwo: [{neighborId: 'subscriberOne', rtt: null}]
            }
        })
    })
    */
    it('tracker should update correctly overlays on subscribe/unsubscribe', async () => {
        
        await runAndWaitForEvents(() => { subscriberOne.unsubscribe('stream-2', 2) },[
            [subscriberTwo, NodeEvent.NODE_UNSUBSCRIBED],
            
            // @ts-expect-error private field
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
            
        ])

        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual({
            'stream-1#0': {
                subscriberOne: [{neighborId: 'subscriberTwo', rtt: null}],
                subscriberTwo: [{neighborId: 'subscriberOne', rtt: null}],
            },
            'stream-2#2': {
                subscriberTwo: []
            }
        })

        await runAndWaitForEvents(() => { subscriberOne.unsubscribe('stream-1', 0) }, [
            [subscriberTwo, NodeEvent.NODE_UNSUBSCRIBED],
            // @ts-expect-error private field
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        ])

        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual({
            'stream-1#0': {
                subscriberTwo: [],
            },
            'stream-2#2': {
                subscriberTwo: []
            }
        })

        await runAndWaitForConditions(
            () => subscriberTwo.unsubscribe('stream-1', 0),
            () => getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())['stream-1#0'] == null
        )

        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual({
            'stream-2#2': {
                subscriberTwo: []
            }
        })

        await runAndWaitForEvents(
            () => subscriberTwo.unsubscribe('stream-2', 2),
            // @ts-expect-error private field
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        )

        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual({})
    
    }, 10 * 1000)
})
