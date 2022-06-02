import { Tracker, startTracker, TrackerServerEvent } from '@streamr/network-tracker'
import { runAndWaitForEvents } from 'streamr-test-utils'
import { RelayMessageSubType, TrackerLayer } from 'streamr-client-protocol'

import { PeerInfo } from '../../src/connection/PeerInfo'
import { NodeToTracker, Event as NodeToTrackerEvent } from '../../src/protocol/NodeToTracker'
import NodeClientWsEndpoint from '../../src/connection/ws/NodeClientWsEndpoint'

const { RelayMessage, ErrorMessage } = TrackerLayer

/**
 * Validate the relaying logic of tracker's WebRTC signalling messages.
 */
describe('RTC signalling messages are routed to destination via tracker', () => {
    let tracker: Tracker
    let originatorNodeToTracker: NodeToTracker
    let targetNodeToTracker: NodeToTracker

    beforeAll(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 28660
            }
        })
        const trackerPeerInfo = PeerInfo.newTracker(tracker.getTrackerId())
        const originatorEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('originator'))
        const targetEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('target'))

        originatorNodeToTracker = new NodeToTracker(originatorEndpoint)
        targetNodeToTracker = new NodeToTracker(targetEndpoint)

        await runAndWaitForEvents(
            () => { originatorNodeToTracker.connectToTracker(tracker.getUrl(), trackerPeerInfo) },[
                // @ts-expect-error private method
                [tracker.trackerServer, TrackerServerEvent.NODE_CONNECTED],
                [originatorNodeToTracker, NodeToTrackerEvent.CONNECTED_TO_TRACKER]        
            ])
            
        await runAndWaitForEvents(
            () => { targetNodeToTracker.connectToTracker(tracker.getUrl(), trackerPeerInfo) }, [
                // @ts-expect-error private method
                [tracker.trackerServer, TrackerServerEvent.NODE_CONNECTED],   
                [targetNodeToTracker, NodeToTrackerEvent.CONNECTED_TO_TRACKER]
            ])
    })

    afterAll(async () => {
        await tracker.stop()
        await originatorNodeToTracker.stop()
        await targetNodeToTracker.stop()
    })

    it('Offer messages are delivered', async () => {
        let requestIdPromise: Promise<string>|undefined
        const [rtcOffers]: any[] = await runAndWaitForEvents(
            () => {
                requestIdPromise = originatorNodeToTracker.sendRtcOffer(
                    tracker.getTrackerId(),
                    'target',
                    'connectionid',
                    PeerInfo.newNode('originator'),
                    'description'
                )
            },
            [targetNodeToTracker, NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED]
        )
        const requestId = await requestIdPromise
        expect(rtcOffers[0]).toEqual(new RelayMessage({
            requestId: requestId!,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: RelayMessageSubType.RTC_OFFER,
            data: {
                connectionId: 'connectionid',
                description: 'description'
            }
        }))
    })

    it('Answer messages are delivered', async () => {
        let requestIdPromise: Promise<string>|undefined
        const [rtcOffers]: any[] = await runAndWaitForEvents(
            () => {
                requestIdPromise = originatorNodeToTracker.sendRtcAnswer(
                    tracker.getTrackerId(),
                    'target',
                    'connectionid',
                    PeerInfo.newNode('originator'),
                    'description'
                )}, [targetNodeToTracker, NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED])

        const requestId = await requestIdPromise
        expect(rtcOffers[0]).toEqual(new RelayMessage({
            requestId: requestId!,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: RelayMessageSubType.RTC_ANSWER,
            data: {
                connectionId: 'connectionid',
                description: 'description'
            }
        }))
    })
    
    it('LocalCandidate messages are delivered', async () => {
        let requestIdPromise: Promise<string>|undefined
        const [rtcOffers]: any[] = await runAndWaitForEvents(
            () => {
                requestIdPromise = originatorNodeToTracker.sendRtcIceCandidate(
                    tracker.getTrackerId(),
                    'target',
                    'connectionid',
                    PeerInfo.newNode('originator'),
                    'candidate',
                    'mid'
                )},[targetNodeToTracker, NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED])

        const requestId = await requestIdPromise
        expect(rtcOffers[0]).toEqual(new RelayMessage({
            requestId: requestId!,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: RelayMessageSubType.ICE_CANDIDATE,
            data: {
                connectionId: 'connectionid',
                candidate: 'candidate',
                mid: 'mid'
            }
        }))
    })
    
    it('RtcConnect messages are delivered', async () => {
        let requestIdPromise: Promise<string> | undefined
        const [rtcOffers]: any[] = await runAndWaitForEvents(
            () => {
                requestIdPromise = originatorNodeToTracker.sendRtcConnect(tracker.getTrackerId(), 'target', PeerInfo.newNode('originator'))
            }, [targetNodeToTracker, NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED])

        const requestId = await requestIdPromise
        expect(rtcOffers[0]).toEqual(new RelayMessage({
            requestId: requestId!,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: RelayMessageSubType.RTC_CONNECT,
            data: {}
        }))
    })
    
    it('RelayMessage with invalid target results in RTC_ERROR response sent back to originator', async () => {
        // Enough to test only sendRtcConnect here as we know all relay message share same error handling logic
        let requestIdPromise: Promise<string> | undefined
        const [rtcErrors]: any[] = await runAndWaitForEvents(
            () => {
                requestIdPromise = originatorNodeToTracker.sendRtcConnect(tracker.getTrackerId(), 'nonExistingNode', 
                    PeerInfo.newUnknown('originator'))
            },[originatorNodeToTracker, NodeToTrackerEvent.RTC_ERROR_RECEIVED])
        
        const requestId = await requestIdPromise
        expect(rtcErrors[0]).toEqual(new ErrorMessage({
            requestId: requestId!,
            errorCode: ErrorMessage.ERROR_CODES.UNKNOWN_PEER,
            targetNode: 'nonExistingNode'
        }))
    })
})
