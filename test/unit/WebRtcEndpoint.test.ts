import { MetricsContext, startTracker } from '../../src/composition'
import { startEndpoint } from '../../src/connection/WsEndpoint'
import { TrackerNode, Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'
import { Tracker, Event as TrackerEvent } from '../../src/logic/Tracker'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { waitForCondition, waitForEvent } from 'streamr-test-utils'
import { Event as EndpointEvent } from '../../src/connection/IWebRtcEndpoint'
import { WebRtcEndpoint } from '../../src/connection/WebRtcEndpoint'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { NegotiatedProtocolVersions } from "../../src/connection/NegotiatedProtocolVersions"

describe('WebRtcEndpoint', () => {
    let tracker: Tracker
    let trackerNode1: TrackerNode
    let trackerNode2: TrackerNode
    let endpoint1: WebRtcEndpoint
    let endpoint2: WebRtcEndpoint

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 28700,
            id: 'tracker'
        })

        const ep1 = await startEndpoint('127.0.0.1', 28701, PeerInfo.newNode('node-1'), null, new MetricsContext(''))
        const ep2 = await startEndpoint('127.0.0.1', 28702, PeerInfo.newNode('node-2'), null, new MetricsContext(''))
        trackerNode1 = new TrackerNode(ep1)
        trackerNode2 = new TrackerNode(ep2)

        trackerNode1.connectToTracker(tracker.getAddress())
        await Promise.all([
            waitForEvent(tracker, TrackerEvent.NODE_CONNECTED),
            waitForEvent(trackerNode1, TrackerNodeEvent.CONNECTED_TO_TRACKER)
        ])

        trackerNode2.connectToTracker(tracker.getAddress())
        await Promise.all([
            waitForEvent(tracker, TrackerEvent.NODE_CONNECTED),
            waitForEvent(trackerNode2, TrackerNodeEvent.CONNECTED_TO_TRACKER)
        ])

        const peerInfo1 = PeerInfo.newNode('node-1')
        const peerInfo2 = PeerInfo.newNode('node-2')
        endpoint1 = new WebRtcEndpoint(peerInfo1, [],
            new RtcSignaller(peerInfo1, trackerNode1), new MetricsContext(''), new NegotiatedProtocolVersions(peerInfo1))
        endpoint2 = new WebRtcEndpoint(peerInfo2, [],
            new RtcSignaller(peerInfo2, trackerNode2), new MetricsContext(''), new NegotiatedProtocolVersions(peerInfo2))

    })

    afterEach(async () => {
        await Promise.allSettled([
            tracker.stop(),
            trackerNode1.stop(),
            trackerNode2.stop(),
            endpoint1.stop(),
            endpoint2.stop()
        ])
    })

    it('connection between nodes is established when both nodes invoke connect()', async () => {
        endpoint1.connect('node-2', 'tracker', true).catch(() => null)
        endpoint2.connect('node-1', 'tracker', false).catch(() => null)

        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED)
        ])

        let ep1NumOfReceivedMessages = 0
        let ep2NumOfReceivedMessages = 0

        endpoint1.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep1NumOfReceivedMessages += 1
        })
        endpoint2.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep2NumOfReceivedMessages += 1
        })

        const sendFrom1To2 = () => {
            endpoint1.send('node-2', JSON.stringify({
                hello: 'world'
            }))
        }
        const sendFrom2To1 = () => {
            endpoint2.send('node-1', JSON.stringify({
                hello: 'world'
            }))
        }

        for (let i = 0; i < 10; ++i) {
            setTimeout(sendFrom1To2, 10 * i)
            setTimeout(sendFrom2To1, 10 * i + 5)
        }

        await waitForCondition(() => ep1NumOfReceivedMessages > 9)
        await waitForCondition(() => ep2NumOfReceivedMessages > 9)
    })

    it('connection between nodes is established when only offerer invokes connect()', async () => {
        endpoint1.connect('node-2', 'tracker').catch(() => null)

        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED)
        ])

        let ep1NumOfReceivedMessages = 0
        let ep2NumOfReceivedMessages = 0

        endpoint1.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep1NumOfReceivedMessages += 1
        })
        endpoint2.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep2NumOfReceivedMessages += 1
        })

        const sendFrom1To2 = () => {
            endpoint1.send('node-2', JSON.stringify({
                hello: 'world'
            }))
        }
        const sendFrom2To1 = () => {
            endpoint2.send('node-1', JSON.stringify({
                hello: 'world'
            }))
        }

        for (let i = 0; i < 10; ++i) {
            setTimeout(sendFrom1To2, 10 * i)
            setTimeout(sendFrom2To1, 10 * i + 5)
        }

        await waitForCondition(() => ep1NumOfReceivedMessages === 10)
        await waitForCondition(() => ep2NumOfReceivedMessages === 10)
    })

    it('connection is formed when only non-offerer invokes connect()', async () => {
        endpoint2.connect('node-1', 'tracker').catch(() => null)

        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED)
        ])
    })

    it('cannot send too large of a payload', (done) => {
        const payload = new Array(2 ** 21).fill('X').join('')
        endpoint1.connect('node-2', 'tracker')
        endpoint1.send('node-2', payload).catch((err) => {
            expect(err.message).toMatch(/Dropping message due to size 2097152 exceeding the limit of \d+/)
            done()
        })
    })

    it('can handle fast paced reconnects', async () => {
        endpoint1.connect('node-2', 'tracker').catch(() => null)
        endpoint2.connect('node-1', 'tracker').catch(() => null)

        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED, 30 * 1000),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED, 30 * 1000)
        ])

        endpoint1.close('node-2', 'test')
        endpoint1.connect('node-2', 'tracker').catch(() => null)

        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED, 30 * 1000),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED, 30 * 1000)
        ])

        endpoint2.close('node-1', 'test')
        endpoint2.connect('node-1', 'tracker').catch(() => null)

        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED, 30 * 1000),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED, 30 * 1000)
        ])
    }, 30 * 1000)

    it('messages are delivered on temporary loss of connectivity', async () => {
        const t = Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED)
        ])

        endpoint1.connect('node-2', 'tracker').catch(() => null)

        await t

        let ep2NumOfReceivedMessages = 0

        endpoint2.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep2NumOfReceivedMessages += 1
        })

        const sendFrom1To2 = () => {
            endpoint1.send('node-2', JSON.stringify({
                hello: 'world'
            }))
        }

        for (let i = 1; i <= 6; ++i) {
            sendFrom1To2()
            if (i === 3) {
                // eslint-disable-next-line no-await-in-loop
                await waitForCondition(() => ep2NumOfReceivedMessages === 3)
                endpoint2.close('node-1', 'test')
                await waitForEvent(endpoint1, EndpointEvent.PEER_DISCONNECTED)
                endpoint1.connect('node-2', 'tracker')
            }
        }
        
        await waitForCondition(() => (
            ep2NumOfReceivedMessages === 6
        ), 30 * 1000, undefined, () => `ep2NumOfReceivedMessages = ${ep2NumOfReceivedMessages}`)
    }, 30 * 1000)
})
