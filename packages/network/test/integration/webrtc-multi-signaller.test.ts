import { MetricsContext } from '../../src/composition'
import { NodeToTracker } from '../../src/protocol/NodeToTracker'
import { Tracker, TrackerEvent, startTracker } from '@streamr/network-tracker'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { runAndWaitForEvents } from 'streamr-test-utils'
import { Event as EndpointEvent } from '../../src/connection/webrtc/IWebRtcEndpoint'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { NegotiatedProtocolVersions } from '../../src/connection/NegotiatedProtocolVersions'
import { WebRtcEndpoint } from '../../src/connection/webrtc/WebRtcEndpoint'
import NodeWebRtcConnectionFactory from '../../src/connection/webrtc/NodeWebRtcConnection'
import NodeClientWsEndpoint from '../../src/connection/ws/NodeClientWsEndpoint'

describe('WebRTC multisignaller test', () => {
    let tracker1: Tracker
    let tracker2: Tracker
    let nodeToTracker1: NodeToTracker
    let nodeToTracker2: NodeToTracker
    let endpoint1: WebRtcEndpoint
    let endpoint2: WebRtcEndpoint

    beforeEach(async () => {
        tracker1 = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 28715
            }
        })
        tracker2 = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 28716
            }
        })

        const ep1 = new NodeClientWsEndpoint(PeerInfo.newNode('node-1'))
        const ep2 = new NodeClientWsEndpoint(PeerInfo.newNode('node-2'))

        nodeToTracker1 = new NodeToTracker(ep1)
        nodeToTracker2 = new NodeToTracker(ep2)

        await runAndWaitForEvents(
            () => {nodeToTracker1.connectToTracker(tracker1.getUrl(), PeerInfo.newTracker(tracker1.getConfigRecord().id))},[
                [tracker1, TrackerEvent.NODE_CONNECTED]
            ])
        
        await runAndWaitForEvents(
            () => { nodeToTracker2.connectToTracker(tracker1.getUrl(), PeerInfo.newTracker(tracker1.getConfigRecord().id))}, [
                [tracker1, TrackerEvent.NODE_CONNECTED]
            ])
        
        await runAndWaitForEvents(
            () => { nodeToTracker1.connectToTracker(tracker2.getUrl(), PeerInfo.newTracker(tracker2.getConfigRecord().id))}, [
                [tracker2, TrackerEvent.NODE_CONNECTED]
            ])
        
        await runAndWaitForEvents(
            () => {nodeToTracker2.connectToTracker(tracker2.getUrl(), PeerInfo.newTracker(tracker2.getConfigRecord().id))},[
                [tracker2, TrackerEvent.NODE_CONNECTED]
            ])

        const peerInfo1 = PeerInfo.newNode('node-1')
        const peerInfo2 = PeerInfo.newNode('node-2')
        endpoint1 = new WebRtcEndpoint(
            peerInfo1,
            ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo1, nodeToTracker1),
            new MetricsContext(),
            new NegotiatedProtocolVersions(peerInfo1),
            NodeWebRtcConnectionFactory
        )
        endpoint2 = new WebRtcEndpoint(
            peerInfo2,
            ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo2, nodeToTracker2),
            new MetricsContext(),
            new NegotiatedProtocolVersions(peerInfo2),
            NodeWebRtcConnectionFactory
        )
    })

    afterEach(async () => {
        await Promise.allSettled([
            tracker1.stop(),
            tracker2.stop(),
            nodeToTracker1.stop(),
            nodeToTracker2.stop(),
            endpoint1.stop(),
            endpoint2.stop(),
        ])
    })

    it('WebRTC connection is established and signalling works if endpoints use different trackers for signalling', async () => {
        await runAndWaitForEvents([
            () => { endpoint1.connect('node-2', tracker1.getConfigRecord().id, true).catch(() => null) },
            () => {endpoint2.connect('node-1', tracker2.getConfigRecord().id, false).catch(() => null)}],[
            [endpoint1, EndpointEvent.PEER_CONNECTED],
            [endpoint2, EndpointEvent.PEER_CONNECTED]
        ])
        await runAndWaitForEvents(
            ()=> {endpoint1.send('node-2', 'Hello')}, [
                [endpoint2, EndpointEvent.MESSAGE_RECEIVED]
            ])
        await runAndWaitForEvents(
            ()=> { endpoint2.send('node-1', 'Hello')}, [
                [endpoint1, EndpointEvent.MESSAGE_RECEIVED]
            ])
    })

})
