import { Tracker } from '../../src/logic/Tracker'
import { waitForEvent } from 'streamr-test-utils'
import { TrackerLayer } from 'streamr-client-protocol'

import { RtcSubTypes } from '../../src/logic/RtcMessage'
import { startEndpoint } from '../../src/connection/WsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { TrackerNode, Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'
import { Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { startTracker } from '../../src/composition'

const { RelayMessage, ErrorMessage } = TrackerLayer

/**
 * Validate the relaying logic of tracker's WebRTC signalling messages.
 */
describe('RTC signalling messages are routed to destination via tracker', () => {
    let tracker: Tracker
    let originatorTrackerNode: TrackerNode
    let targetTrackerNode: TrackerNode

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 28660,
            id: 'tracker'
        })
        const originatorEndpoint = await startEndpoint('127.0.0.1', 28661, PeerInfo.newNode('originator'), null)
        const targetEndpoint = await startEndpoint('127.0.0.1', 28662, PeerInfo.newNode('target'), null)

        originatorTrackerNode = new TrackerNode(originatorEndpoint)
        targetTrackerNode = new TrackerNode(targetEndpoint)

        originatorTrackerNode.connectToTracker(tracker.getAddress())
        targetTrackerNode.connectToTracker(tracker.getAddress())

        await Promise.all([
            // @ts-expect-error private method
            waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_CONNECTED),
            // @ts-expect-error private method
            waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_CONNECTED),
            waitForEvent(targetTrackerNode, TrackerNodeEvent.CONNECTED_TO_TRACKER),
            waitForEvent(originatorTrackerNode, TrackerNodeEvent.CONNECTED_TO_TRACKER)
        ])
    })

    afterAll(async () => {
        await tracker.stop()
        await originatorTrackerNode.stop()
        await targetTrackerNode.stop()
    })

    it('Offer messages are delivered', async () => {
        const sentMsg = await originatorTrackerNode.sendRtcOffer(
            'tracker',
            'target',
            'connectionid',
            PeerInfo.newNode('originator'),
            'description'
        )
        const [rtcOffer] = await waitForEvent(targetTrackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId: sentMsg.requestId,
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
        const sentMsg = await originatorTrackerNode.sendRtcAnswer(
            'tracker',
            'target',
            'connectionid',
            PeerInfo.newNode('originator'),
            'description'
        )
        const [rtcOffer] = await waitForEvent(targetTrackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId: sentMsg.requestId,
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
        const sentMsg = await originatorTrackerNode.sendRtcIceCandidate(
            'tracker',
            'target',
            'connectionid',
            PeerInfo.newNode('originator'),
            'candidate',
            'mid'
        )
        const [rtcOffer] = await waitForEvent(targetTrackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId: sentMsg.requestId,
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
        const sentMsg = await originatorTrackerNode.sendRtcConnect('tracker', 'target', PeerInfo.newNode('originator'), false)
        const [rtcOffer] = await waitForEvent(targetTrackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId: sentMsg.requestId,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: RtcSubTypes.RTC_CONNECT,
            data: {
                force: false
            }

        }))
    })

    it('RelayMessage with invalid target results in RTC_ERROR response sent back to originator', async () => {
        // Enough to test only sendRtcConnect here as we know all relay message share same error handling logic
        const sentMsg = await originatorTrackerNode.sendRtcConnect('tracker', 'nonExistingNode', PeerInfo.newUnknown('originator'), false)
        const [rtcError] = await waitForEvent(originatorTrackerNode, TrackerNodeEvent.RTC_ERROR_RECEIVED)
        expect(rtcError).toEqual(new ErrorMessage({
            requestId: sentMsg.requestId,
            errorCode: ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
            targetNode: 'nonExistingNode'
        }))
    })
})
