import { Tracker } from '../../src/logic/tracker/Tracker'
import { waitForEvent } from 'streamr-test-utils'
import { TrackerLayer } from 'streamr-client-protocol'

import { PeerInfo } from '../../src/connection/PeerInfo'
import { NodeToTracker, Event as NodeToTrackerEvent } from '../../src/protocol/NodeToTracker'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { startTracker } from '../../src/composition'
import NodeClientWsEndpoint from '../../src/connection/ws/NodeClientWsEndpoint'
import { RtcSubTypes } from '../../src/identifiers'

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
            },
            id: 'tracker'
        })
        const trackerPeerInfo = PeerInfo.newTracker('tracker')
        const originatorEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('originator'))
        const targetEndpoint = new NodeClientWsEndpoint(PeerInfo.newNode('target'))

        originatorNodeToTracker = new NodeToTracker(originatorEndpoint)
        targetNodeToTracker = new NodeToTracker(targetEndpoint)

        originatorNodeToTracker.connectToTracker(tracker.getUrl(), trackerPeerInfo)
        targetNodeToTracker.connectToTracker(tracker.getUrl(), trackerPeerInfo)

        await Promise.all([
            // @ts-expect-error private method
            waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_CONNECTED),
            // @ts-expect-error private method
            waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_CONNECTED),
            waitForEvent(targetNodeToTracker, NodeToTrackerEvent.CONNECTED_TO_TRACKER),
            waitForEvent(originatorNodeToTracker, NodeToTrackerEvent.CONNECTED_TO_TRACKER)
        ])
    })

    afterAll(async () => {
        await tracker.stop()
        await originatorNodeToTracker.stop()
        await targetNodeToTracker.stop()
    })

    it('Offer messages are delivered', async () => {
        const requestId = await originatorNodeToTracker.sendRtcOffer(
            'tracker',
            'target',
            'connectionid',
            PeerInfo.newNode('originator'),
            'description'
        )
        const [rtcOffer] = await waitForEvent(targetNodeToTracker, NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: RtcSubTypes.RTC_OFFER,
            data: {
                connectionId: 'connectionid',
                description: 'description'
            }
        }))
    })

    it('Answer messages are delivered', async () => {
        const requestId = await originatorNodeToTracker.sendRtcAnswer(
            'tracker',
            'target',
            'connectionid',
            PeerInfo.newNode('originator'),
            'description'
        )
        const [rtcOffer] = await waitForEvent(targetNodeToTracker, NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: RtcSubTypes.RTC_ANSWER,
            data: {
                connectionId: 'connectionid',
                description: 'description'
            }
        }))
    })

    it('LocalCandidate messages are delivered', async () => {
        const requestId = await originatorNodeToTracker.sendRtcIceCandidate(
            'tracker',
            'target',
            'connectionid',
            PeerInfo.newNode('originator'),
            'candidate',
            'mid'
        )
        const [rtcOffer] = await waitForEvent(targetNodeToTracker, NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: RtcSubTypes.ICE_CANDIDATE,
            data: {
                connectionId: 'connectionid',
                candidate: 'candidate',
                mid: 'mid'
            }
        }))
    })

    it('RtcConnect messages are delivered', async () => {
        const requestId = await originatorNodeToTracker.sendRtcConnect('tracker', 'target', PeerInfo.newNode('originator'))
        const [rtcOffer] = await waitForEvent(targetNodeToTracker, NodeToTrackerEvent.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: RtcSubTypes.RTC_CONNECT,
            data: {}

        }))
    })

    it('RelayMessage with invalid target results in RTC_ERROR response sent back to originator', async () => {
        // Enough to test only sendRtcConnect here as we know all relay message share same error handling logic
        const requestId = await originatorNodeToTracker.sendRtcConnect('tracker', 'nonExistingNode', PeerInfo.newUnknown('originator'))
        const [rtcError] = await waitForEvent(originatorNodeToTracker, NodeToTrackerEvent.RTC_ERROR_RECEIVED)
        expect(rtcError).toEqual(new ErrorMessage({
            requestId,
            errorCode: ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
            targetNode: 'nonExistingNode'
        }))
    })
})
