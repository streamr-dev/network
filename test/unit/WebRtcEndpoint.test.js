const { waitForCondition, waitForEvent } = require('streamr-test-utils')

const { MetricsContext } = require('../../src/helpers/MetricsContext')
const { PeerInfo } = require('../../src/connection/PeerInfo')
const { RtcSignaller } = require('../../src/logic/RtcSignaller')
const { startEndpoint } = require('../../src/connection/WsEndpoint')
const { WebRtcEndpoint, Event } = require('../../src/connection/WebRtcEndpoint')
const { startTracker } = require('../../src/composition')
const { TrackerNode } = require('../../src/protocol/TrackerNode')
const { Event: TrackerServerEvent } = require('../../src/protocol/TrackerServer')

describe('WebRtcEndpoint', () => {
    let tracker
    let trackerNode1
    let trackerNode2
    let endpoint1
    let endpoint2

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 28700,
            id: 'tracker'
        })

        const ep1 = await startEndpoint('127.0.0.1', 28701, PeerInfo.newNode('node-1'), null)
        const ep2 = await startEndpoint('127.0.0.1', 28702, PeerInfo.newNode('node-2'), null)
        trackerNode1 = new TrackerNode(ep1)
        trackerNode2 = new TrackerNode(ep2)

        trackerNode1.connectToTracker(tracker.getAddress())
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_CONNECTED)
        trackerNode2.connectToTracker(tracker.getAddress())
        await waitForEvent(tracker.trackerServer, TrackerServerEvent.NODE_CONNECTED)

        const peerInfo1 = PeerInfo.newNode('node-1')
        const peerInfo2 = PeerInfo.newNode('node-2')
        endpoint1 = new WebRtcEndpoint('node-1', ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo1, trackerNode1), new MetricsContext(null))
        endpoint2 = new WebRtcEndpoint('node-2', ['stun:stun.l.google.com:19302'],
            new RtcSignaller(peerInfo2, trackerNode2), new MetricsContext(null))
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
            waitForEvent(endpoint1, Event.PEER_CONNECTED),
            waitForEvent(endpoint2, Event.PEER_CONNECTED)
        ])

        let ep1NumOfReceivedMessages = 0
        let ep2NumOfReceivedMessages = 0

        endpoint1.on(Event.MESSAGE_RECEIVED, (targetPeerId, message) => {
            ep1NumOfReceivedMessages += 1
        })
        endpoint2.on(Event.MESSAGE_RECEIVED, (targetPeerId, message) => {
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

    it('connection between nodes is established when only one node invokes connect()', async () => {
        endpoint1.connect('node-2', 'tracker').catch(() => null)

        await Promise.all([
            waitForEvent(endpoint1, Event.PEER_CONNECTED),
            waitForEvent(endpoint2, Event.PEER_CONNECTED)
        ])

        let ep1NumOfReceivedMessages = 0
        let ep2NumOfReceivedMessages = 0

        endpoint1.on(Event.MESSAGE_RECEIVED, (targetPeerId, message) => {
            ep1NumOfReceivedMessages += 1
        })
        endpoint2.on(Event.MESSAGE_RECEIVED, (targetPeerId, message) => {
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
})
