import { Event as wrtcEvent } from '../../src/connection/IWebRtcEndpoint'
import { WebRtcEndpoint } from "../../src/connection/WebRtcEndpoint"
import { PeerInfo, PeerType } from '../../src/connection/PeerInfo'
import { MetricsContext } from '../../src/helpers/MetricsContext'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { Tracker } from '../../src/logic/Tracker'
import { startTracker } from '../../src/composition'
import { startEndpoint } from '../../src/connection/WsEndpoint'
import { TrackerNode } from '../../src/protocol/TrackerNode'
import { NegotiatedProtocolVersions } from "../../src/connection/NegotiatedProtocolVersions"
import { Event as ntnEvent, NodeToNode } from "../../src/protocol/NodeToNode"
import { MessageID, StreamMessage } from "streamr-client-protocol"
import { waitForEvent } from "streamr-test-utils"

describe('Node-to-Node protocol version negotiation', () => {
    let tracker: Tracker
    let trackerNode1: TrackerNode
    let trackerNode2: TrackerNode
    let trackerNode3: TrackerNode
    let ep1: WebRtcEndpoint
    let ep2: WebRtcEndpoint
    let ep3: WebRtcEndpoint
    let nodeToNode1: NodeToNode
    let nodeToNode2: NodeToNode

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 28680,
            id: 'tracker'
        })

        const peerInfo1 = new PeerInfo('node-endpoint1', PeerType.Node, [1, 2, 3], [29, 30, 31])
        const peerInfo2 = new PeerInfo('node-endpoint2', PeerType.Node, [1, 2], [31, 32, 33])
        const peerInfo3 = new PeerInfo('node-endpoint3', PeerType.Node, [1, 2], [32])

        // Need to set up TrackerNodes and WsEndpoint(s) to exchange RelayMessage(s) via tracker
        const wsEp1 = await startEndpoint('127.0.0.1', 28681, peerInfo1, null, new MetricsContext(peerInfo1.peerId))
        const wsEp2 = await startEndpoint('127.0.0.1', 28682, peerInfo2, null, new MetricsContext(peerInfo2.peerId))
        const wsEp3 = await startEndpoint('127.0.0.1', 28683, peerInfo3, null, new MetricsContext(peerInfo2.peerId))
        trackerNode1 = new TrackerNode(wsEp1)
        trackerNode2 = new TrackerNode(wsEp2)
        trackerNode3 = new TrackerNode(wsEp3)

        await trackerNode1.connectToTracker(tracker.getAddress())
        await trackerNode2.connectToTracker(tracker.getAddress())
        await trackerNode3.connectToTracker(tracker.getAddress())

        // Set up WebRTC endpoints
        ep1 = new WebRtcEndpoint(
            peerInfo1,
            [],
            new RtcSignaller(peerInfo1, trackerNode1),
            new MetricsContext('node-endpoint1'),
            new NegotiatedProtocolVersions(peerInfo1),
            5000
        )
        ep2 = new WebRtcEndpoint(
            peerInfo2,
            [],
            new RtcSignaller(peerInfo2, trackerNode2),
            new MetricsContext('node-endpoint2'),
            new NegotiatedProtocolVersions(peerInfo2),
            5000
        )
        ep3 = new WebRtcEndpoint(
            peerInfo3,
            [],
            new RtcSignaller(peerInfo3, trackerNode3),
            new MetricsContext('node-endpoint3'),
            new NegotiatedProtocolVersions(peerInfo3),
            5000
        )
        nodeToNode1 = new NodeToNode(ep1)
        nodeToNode2 = new NodeToNode(ep2)

        nodeToNode1.connectToNode('node-endpoint2', 'tracker')
        await Promise.all([
            waitForEvent(nodeToNode1, ntnEvent.NODE_CONNECTED),
            waitForEvent(nodeToNode2, ntnEvent.NODE_CONNECTED)
        ])
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

    it('protocol versions are correctly negotiated',  () => {
        expect(nodeToNode1.getNegotiatedProtocolVersionsOnNode('node-endpoint2')).toEqual([2,31])
        expect(nodeToNode2.getNegotiatedProtocolVersionsOnNode('node-endpoint1')).toEqual([2,31])
    })

    it('messages are sent with the negotiated protocol version', (done) => {
        ep2.once(wrtcEvent.MESSAGE_RECEIVED, (peerInfo, data) => {
            const parsedData = JSON.parse(data)
            expect(parsedData[0]).toEqual(2)
            expect(parsedData[3][0]).toEqual(31)
            done()
        })
        const i = 1
        const msg1 = new StreamMessage({
            messageId: new MessageID('stream-1', 0, i, 0, 'node-endpoint1', 'msgChainId'),
            prevMsgRef: null,
            content: {
                messageNo: i
            },
        })
        nodeToNode1.sendData('node-endpoint2', msg1)
    })

    it('negotiated version is removed once node is disconnected', async () => {
        ep1.close('node-endpoint2', 'test')
        await waitForEvent(ep2, wrtcEvent.PEER_DISCONNECTED)

        expect(ep1.getNegotiatedControlLayerProtocolVersionOnNode('node-endpoint2')).toEqual(undefined)
        expect(ep2.getNegotiatedControlLayerProtocolVersionOnNode('node-endpoint1')).toEqual(undefined)
    })

    it('if there are no shared versions the connection is closed', async () => {
        let errors = 0
        try {
            await ep3.connect('node-endpoint1', 'tracker')
        } catch (err) {
            errors += 1
        }
        expect(errors).toEqual(1)
    })
})
