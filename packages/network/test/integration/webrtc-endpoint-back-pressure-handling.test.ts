import { Event } from '../../src/connection/webrtc/IWebRtcEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { MetricsContext } from '../../src/helpers/Metric'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { startTracker, Tracker } from '@streamr/network-tracker'
import NodeClientWsEndpoint from '../../src/connection/ws/NodeClientWsEndpoint'
import { NodeToTracker } from '../../src/protocol/NodeToTracker'
import { wait } from '@streamr/utils'
import { NegotiatedProtocolVersions } from '../../src/connection/NegotiatedProtocolVersions'
import { WebRtcEndpoint } from '../../src/connection/webrtc/WebRtcEndpoint'
import { webRtcConnectionFactory } from '../../src/connection/webrtc/NodeWebRtcConnection'

describe('WebRtcEndpoint: back pressure handling', () => {
    let tracker: Tracker
    let nodeToTracker1: NodeToTracker
    let nodeToTracker2: NodeToTracker
    let ep1: WebRtcEndpoint
    let ep2: WebRtcEndpoint

    beforeEach(async () => {
        tracker = await startTracker({
            listen: {
                hostname: '127.0.0.1',
                port: 28710
            }
        })

        const peerInfo1 = PeerInfo.newNode('ep1')
        const peerInfo2 = PeerInfo.newNode('ep2')

        // Need to set up NodeToTrackers and WsEndpoint(s) to exchange RelayMessage(s) via tracker
        const wsEp1 = new NodeClientWsEndpoint(peerInfo1)
        const wsEp2 = new NodeClientWsEndpoint(peerInfo2)
        nodeToTracker1 = new NodeToTracker(wsEp1)
        nodeToTracker2 = new NodeToTracker(wsEp2)
        await nodeToTracker1.connectToTracker(tracker.getUrl(), PeerInfo.newTracker(tracker.getTrackerId()))
        await nodeToTracker2.connectToTracker(tracker.getUrl(), PeerInfo.newTracker(tracker.getTrackerId()))

        // Set up WebRTC endpoints
        ep1 = new WebRtcEndpoint(
            peerInfo1,
            ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo1, nodeToTracker1),
            new MetricsContext(),
            new NegotiatedProtocolVersions(peerInfo1),
            webRtcConnectionFactory
        )
        ep2 = new WebRtcEndpoint(
            peerInfo2,
            ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo2, nodeToTracker2),
            new MetricsContext(),
            new NegotiatedProtocolVersions(peerInfo2),
            webRtcConnectionFactory
        )
        await Promise.all([
            ep1.connect('ep2', tracker.getTrackerId()),
            ep2.connect('ep1', tracker.getTrackerId())
        ])
    })

    afterEach(async () => {
        await Promise.allSettled([
            tracker.stop(),
            nodeToTracker1.stop(),
            nodeToTracker2.stop(),
            ep1.stop(),
            ep2.stop()
        ])
    })

    function inflictHighBackPressure(): Promise<void> {
        for (let i = 0; i <= 25; ++i) {
            ep1.send('ep2', new Array(1024 * 256).fill('X').join(''))
        }
        return wait(0) // Relinquish control to allow for setImmediate(() => this.attemptToFlushMessages())
    }

    it('emits HIGH_BACK_PRESSURE on high back pressure', (done) => {
        ep1.once(Event.HIGH_BACK_PRESSURE, (peerInfo: PeerInfo) => {
            expect(peerInfo.peerId).toEqual('ep2')
            done()
        })
        inflictHighBackPressure()
    })

    it('emits LOW_BACK_PRESSURE after high back pressure',  (done) => {
        ep1.once(Event.HIGH_BACK_PRESSURE, () => {
            ep1.once(Event.LOW_BACK_PRESSURE, (peerInfo: PeerInfo) => {
                expect(peerInfo.peerId).toEqual('ep2')
                done()
            })
        })
        inflictHighBackPressure()
    })
})
