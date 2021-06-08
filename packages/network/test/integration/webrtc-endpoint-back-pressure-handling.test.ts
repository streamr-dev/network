import { Event } from '../../src/connection/IWebRtcEndpoint'
import { WebRtcEndpoint } from '../../src/connection/WebRtcEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { MetricsContext } from '../../src/helpers/MetricsContext'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { Tracker } from '../../src/logic/Tracker'
import { startTracker } from '../../src/composition'
import { startEndpoint } from '../../src/connection/WsEndpoint'
import { TrackerNode } from '../../src/protocol/TrackerNode'
import { wait } from 'streamr-test-utils'
import { NegotiatedProtocolVersions } from "../../src/connection/NegotiatedProtocolVersions"

describe('WebRtcEndpoint: back pressure handling', () => {
    let tracker: Tracker
    let trackerNode1: TrackerNode
    let trackerNode2: TrackerNode
    let ep1: WebRtcEndpoint
    let ep2: WebRtcEndpoint

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 28710,
            id: 'tracker'
        })

        const peerInfo1 = PeerInfo.newNode('ep1')
        const peerInfo2 = PeerInfo.newNode('ep2')

        // Need to set up TrackerNodes and WsEndpoint(s) to exchange RelayMessage(s) via tracker
        const wsEp1 = await startEndpoint('127.0.0.1', 28711, peerInfo1, null, new MetricsContext(peerInfo1.peerId))
        const wsEp2 = await startEndpoint('127.0.0.1', 28712, peerInfo2, null, new MetricsContext(peerInfo2.peerId))
        trackerNode1 = new TrackerNode(wsEp1)
        trackerNode2 = new TrackerNode(wsEp2)
        await trackerNode1.connectToTracker(tracker.getAddress())
        await trackerNode2.connectToTracker(tracker.getAddress())

        // Set up WebRTC endpoints
        ep1 = new WebRtcEndpoint(
            peerInfo1,
            ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo1, trackerNode1),
            new MetricsContext('ep1'),
            new NegotiatedProtocolVersions(peerInfo1)
        )
        ep2 = new WebRtcEndpoint(
            peerInfo2,
            ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo2, trackerNode2),
            new MetricsContext('ep'),
            new NegotiatedProtocolVersions(peerInfo2)
        )
        await ep1.connect('ep2', 'tracker')
    })

    afterEach(async () => {
        await Promise.allSettled([
            tracker.stop(),
            trackerNode1.stop(),
            trackerNode2.stop(),
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
        const ep2 = PeerInfo.newNode('ep2')
        ep1.once(Event.HIGH_BACK_PRESSURE, (peerInfo) => {
            expect(peerInfo).toEqual(expect.objectContaining({
                peerId: ep2.peerId,
                peerType: ep2.peerType,
                controlLayerVersions: ep2.controlLayerVersions,
                messageLayerVersions: ep2.messageLayerVersions,
                peerName: ep2.peerName,
                location: ep2.location,        
            }))
            done()
        })
        inflictHighBackPressure()
    })

    it('emits LOW_BACK_PRESSURE after high back pressure',  (done) => {
        const ep2 = PeerInfo.newNode('ep2')
        ep1.once(Event.HIGH_BACK_PRESSURE, () => {
            ep1.once(Event.LOW_BACK_PRESSURE, (peerInfo) => {
                expect(peerInfo).toEqual(expect.objectContaining({
                    peerId: ep2.peerId,
                    peerType: ep2.peerType,
                    controlLayerVersions: ep2.controlLayerVersions,
                    messageLayerVersions: ep2.messageLayerVersions,
                    peerName: ep2.peerName,
                    location: ep2.location,        
                }))
                done()
            })
        })
        inflictHighBackPressure()
    })
})
