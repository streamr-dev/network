import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { runAndWaitForEvents, runAndWaitForConditions } from 'streamr-test-utils'

import { startNetworkNode, startTracker } from '../../src/composition'
import { Event as NodeEvent } from '../../src/logic/Node'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { getTopology } from '../../src/logic/trackerSummaryUtils'

describe('check tracker, nodes and statuses from nodes', () => {
    let tracker: Tracker
    let subscriberOne: NetworkNode
    let subscriberTwo: NetworkNode
    let nodeSessionId1: string 
    let nodeSessionId2: string 

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

        // @ts-expect-error private method
        nodeSessionId1 = subscriberOne.peerInfo.peerId
        // @ts-expect-error private method
        nodeSessionId2 = subscriberTwo.peerInfo.peerId

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
        // @ts-expect-error private field
        await runAndWaitForEvents(() => {subscriberOne.start()}, [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]) 
        
        let expectedObject: any = {
            'stream-1::0':{},
            'stream-2::2':{}
        }

        expectedObject['stream-1::0'][nodeSessionId1] = []
        expectedObject['stream-2::2'][nodeSessionId1] = []

        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(expectedObject)
        
        // @ts-expect-error private field
        await runAndWaitForEvents(()=> { subscriberTwo.start() }, [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED])
        expectedObject = {
            'stream-1::0':{},
            'stream-2::2':{}
        } 

        expectedObject['stream-1::0'][nodeSessionId1] = [{neighborId: nodeSessionId2, rtt:null}]
        expectedObject['stream-1::0'][nodeSessionId2] = [{neighborId: nodeSessionId1, rtt:null}]
        expectedObject['stream-2::2'][nodeSessionId1] = [{neighborId: nodeSessionId2, rtt:null}]
        expectedObject['stream-2::2'][nodeSessionId2] = [{neighborId: nodeSessionId1, rtt:null}]
        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(expectedObject)
    })

    it('tracker should update correctly overlays on subscribe/unsubscribe', async () => {
        await runAndWaitForEvents([ () => { subscriberOne.start() }, () => { subscriberTwo.start() }],[ 
            [subscriberOne, NodeEvent.NODE_SUBSCRIBED],
            [subscriberTwo, NodeEvent.NODE_SUBSCRIBED],
            // @ts-expect-error private field
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        ])
        
        await runAndWaitForEvents(() => { subscriberOne.unsubscribe('stream-2', 2) },[
            [subscriberTwo, NodeEvent.NODE_UNSUBSCRIBED],
            // @ts-expect-error private field
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        ])

        let expectedObject: any = {
            'stream-1::0':{},
            'stream-2::2':{}
        } 

        expectedObject['stream-1::0'][nodeSessionId1] = [{neighborId: nodeSessionId2, rtt:null}]
        expectedObject['stream-1::0'][nodeSessionId2] = [{neighborId: nodeSessionId1, rtt:null}]
        expectedObject['stream-2::2'][nodeSessionId2] = []

        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(expectedObject)

        await runAndWaitForEvents(() => { subscriberOne.unsubscribe('stream-1', 0) }, [
            [subscriberTwo, NodeEvent.NODE_UNSUBSCRIBED],
            // @ts-expect-error private field
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        ]) 

        expectedObject = {
            'stream-1::0':{},
            'stream-2::2':{}
        } 

        expectedObject['stream-1::0'][nodeSessionId2] = []
        expectedObject['stream-2::2'][nodeSessionId2] = []
        
        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(expectedObject)

        await runAndWaitForConditions(() => { subscriberTwo.unsubscribe('stream-1', 0) }, 
            () => { return getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())['stream-1::0'] == null }
        )

        expectedObject = {
            'stream-2::2':{}
        } 

        expectedObject['stream-2::2'][nodeSessionId2] = []

        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual(expectedObject)
        
        await runAndWaitForEvents(() => { subscriberTwo.unsubscribe('stream-2', 2) }, 
            // @ts-expect-error private field
            [tracker.trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED]
        )

        expect(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())).toEqual({})
    }, 10 * 1000)
    
})
