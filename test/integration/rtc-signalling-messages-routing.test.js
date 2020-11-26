const { waitForEvent } = require('streamr-test-utils')
const { RelayMessage, ErrorMessage } = require('streamr-client-protocol').TrackerLayer

const { startEndpoint } = require('../../src/connection/WsEndpoint')
const { PeerInfo } = require('../../src/connection/PeerInfo')
const TrackerNode = require('../../src/protocol/TrackerNode')
const TrackerServer = require('../../src/protocol/TrackerServer')
const { SUB_TYPES } = require('../../src/protocol/RtcMessages')
const { startTracker } = require('../../src/composition')

/**
 * Validate the relaying logic of tracker's WebRTC signalling messages.
 */
describe('RTC signalling messages are routed to destination via tracker', () => {
    let tracker
    let originatorTrackerNode
    let targetTrackerNode

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
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_CONNECTED),
            waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_CONNECTED),
            waitForEvent(targetTrackerNode, TrackerNode.events.CONNECTED_TO_TRACKER),
            waitForEvent(originatorTrackerNode, TrackerNode.events.CONNECTED_TO_TRACKER)
        ])
    })

    afterAll(async () => {
        await tracker.stop()
        await originatorTrackerNode.stop()
        await targetTrackerNode.stop()
    })

    it('LocalDescription (offer) messages are delivered', async () => {
        const sentMsg = await originatorTrackerNode.sendLocalDescription(
            'tracker',
            'target',
            PeerInfo.newNode('originator'),
            'offer',
            'description'
        )
        const [rtcOffer] = await waitForEvent(targetTrackerNode, TrackerNode.events.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId: sentMsg.requestId,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: SUB_TYPES.RTC_OFFER,
            data: {
                description: 'description'
            }
        }))
    })

    it('LocalDescription (answer) messages are delivered', async () => {
        const sentMsg = await originatorTrackerNode.sendLocalDescription(
            'tracker',
            'target',
            PeerInfo.newNode('originator'),
            'answer',
            'description'
        )
        const [rtcOffer] = await waitForEvent(targetTrackerNode, TrackerNode.events.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId: sentMsg.requestId,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: SUB_TYPES.RTC_ANSWER,
            data: {
                description: 'description'
            }
        }))
    })

    it('LocalCandidate messages are delivered', async () => {
        const sentMsg = await originatorTrackerNode.sendLocalCandidate(
            'tracker',
            'target',
            PeerInfo.newNode('originator'),
            'candidate',
            'mid'
        )
        const [rtcOffer] = await waitForEvent(targetTrackerNode, TrackerNode.events.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId: sentMsg.requestId,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: SUB_TYPES.REMOTE_CANDIDATE,
            data: {
                candidate: 'candidate',
                mid: 'mid'
            }
        }))
    })

    it('RtcConnect messages are delivered', async () => {
        const sentMsg = await originatorTrackerNode.sendRtcConnect('tracker', 'target', PeerInfo.newNode('originator'))
        const [rtcOffer] = await waitForEvent(targetTrackerNode, TrackerNode.events.RELAY_MESSAGE_RECEIVED)
        expect(rtcOffer).toEqual(new RelayMessage({
            requestId: sentMsg.requestId,
            originator: PeerInfo.newNode('originator'),
            targetNode: 'target',
            subType: SUB_TYPES.RTC_CONNECT,
            data: {}
        }))
    })

    it('RelayMessage with invalid target results in RTC_ERROR response sent back to originator', async () => {
        // Enough to test only sendRtcConnect here as we know all relay message share same error handling logic
        const sentMsg = await originatorTrackerNode.sendRtcConnect('tracker', 'nonExistingNode', PeerInfo.newUnknown('originator'))
        const [rtcError] = await waitForEvent(originatorTrackerNode, TrackerNode.events.RTC_ERROR_RECEIVED)
        expect(rtcError).toEqual(new ErrorMessage({
            requestId: sentMsg.requestId,
            errorCode: ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
            targetNode: 'nonExistingNode'
        }))
    })
})
