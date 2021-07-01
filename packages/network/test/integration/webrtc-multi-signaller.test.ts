import { MetricsContext, startTracker } from '../../src/composition'
import { TrackerNode } from '../../src/protocol/TrackerNode'
import { Tracker, Event as TrackerEvent } from '../../src/logic/Tracker'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { waitForEvent } from 'streamr-test-utils'
import { Event as EndpointEvent } from '../../src/connection/IWebRtcEndpoint'
import { WebRtcEndpoint } from '../../src/connection/WebRtcEndpoint'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { NegotiatedProtocolVersions } from "../../src/connection/NegotiatedProtocolVersions"
import { startClientWsEndpoint } from '../../src/connection/ClientWsEndpoint'

describe('WebRTC multisignaller test', () => {
    let tracker1: Tracker
    let tracker2: Tracker
    let trackerNode1: TrackerNode
    let trackerNode2: TrackerNode
    let endpoint1: WebRtcEndpoint
    let endpoint2: WebRtcEndpoint

    beforeEach(async () => {
        tracker1 = await startTracker({
            host: '127.0.0.1',
            port: 28715,
            id: 'tracker1'
        })
        tracker2 = await startTracker({
            host: '127.0.0.1',
            port: 28716,
            id: 'tracker2'
        })

        const ep1 = await startClientWsEndpoint(PeerInfo.newNode('node-1'), new MetricsContext(''))
        const ep2 = await startClientWsEndpoint(PeerInfo.newNode('node-2'), new MetricsContext(''))

        trackerNode1 = new TrackerNode(ep1)
        trackerNode2 = new TrackerNode(ep2)

        trackerNode1.connectToTracker(tracker1.getAddress())
        await waitForEvent(tracker1, TrackerEvent.NODE_CONNECTED)
        trackerNode2.connectToTracker(tracker1.getAddress())
        await waitForEvent(tracker1, TrackerEvent.NODE_CONNECTED)
        trackerNode1.connectToTracker(tracker2.getAddress())
        await waitForEvent(tracker2, TrackerEvent.NODE_CONNECTED)
        trackerNode2.connectToTracker(tracker2.getAddress())
        await waitForEvent(tracker2, TrackerEvent.NODE_CONNECTED)

        const peerInfo1 = PeerInfo.newNode('node-1')
        const peerInfo2 = PeerInfo.newNode('node-2')
        endpoint1 = new WebRtcEndpoint(peerInfo1, ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo1, trackerNode1), new MetricsContext(''), new NegotiatedProtocolVersions(peerInfo1))
        endpoint2 = new WebRtcEndpoint(peerInfo2, ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo2, trackerNode2), new MetricsContext(''), new NegotiatedProtocolVersions(peerInfo2))
    })

    afterEach(async () => {
        await Promise.allSettled([
            tracker1.stop(),
            tracker2.stop(),
            trackerNode1.stop(),
            trackerNode2.stop(),
            endpoint1.stop(),
            endpoint2.stop(),
        ])
    })

    it('WebRTC connection is established and signalling works if endpoints use different trackers for signalling', async () => {
        endpoint1.connect('node-2', 'tracker1', true).catch(() => null)
        endpoint2.connect('node-1', 'tracker2', false).catch(() => null)
        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED)
        ])

        endpoint1.send('node-2', 'Hello')
        await waitForEvent(endpoint2, EndpointEvent.MESSAGE_RECEIVED)
        endpoint2.send('node-1', 'Hello')
        await waitForEvent(endpoint1, EndpointEvent.MESSAGE_RECEIVED)
    })

})