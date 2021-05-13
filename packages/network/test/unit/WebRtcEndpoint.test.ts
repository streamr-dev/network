import { MetricsContext, startTracker } from '../../src/composition'
import { startEndpoint } from '../../src/connection/WsEndpoint'
import { TrackerNode } from '../../src/protocol/TrackerNode'
import { Tracker, Event as TrackerEvent } from '../../src/logic/Tracker'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { waitForCondition, waitForEvent, wait } from 'streamr-test-utils'
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
        await Promise.all([
            trackerNode1.connectToTracker(tracker.getAddress()),
            waitForEvent(tracker, TrackerEvent.NODE_CONNECTED)
        ])
        await Promise.all([
            trackerNode2.connectToTracker(tracker.getAddress()),
            waitForEvent(tracker, TrackerEvent.NODE_CONNECTED)
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

    afterEach(async () => {
        // add some space between tests
        // TODO: remove this
        await wait(3000)
    })

    it('connection between nodes is established when both nodes invoke connect()', async () => {

        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED),
            endpoint1.connect('node-2', 'tracker', true),
            endpoint2.connect('node-1', 'tracker', false),
        ])

        let ep1NumOfReceivedMessages = 0
        let ep2NumOfReceivedMessages = 0

        endpoint1.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep1NumOfReceivedMessages += 1
        })
        endpoint2.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep2NumOfReceivedMessages += 1
        })

        const sendFrom1To2 = async () => {
            return endpoint1.send('node-2', JSON.stringify({
                hello: 'world'
            }))
        }
        const sendFrom2To1 = async () => {
            return endpoint2.send('node-1', JSON.stringify({
                hello: 'world'
            }))
        }
        const sendTasks = []
        for (let i = 0; i < 10; ++i) {
            const time = 10 * i
            sendTasks.push(Promise.all([
                wait(time).then(sendFrom1To2),
                wait(time + 5).then(sendFrom2To1)
            ]))
        }

        await waitForCondition(() => ep1NumOfReceivedMessages > 9)
        await waitForCondition(() => ep2NumOfReceivedMessages > 9)
        await Promise.all(sendTasks)
    })

    it('connection between nodes is established when only one node invokes connect()', async () => {
        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED),
            endpoint1.connect('node-2', 'tracker')
        ])

        let ep1NumOfReceivedMessages = 0
        let ep2NumOfReceivedMessages = 0

        endpoint1.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep1NumOfReceivedMessages += 1
        })
        endpoint2.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep2NumOfReceivedMessages += 1
        })

        const sendFrom1To2 = async () => {
            return endpoint1.send('node-2', JSON.stringify({
                hello: 'world'
            }))
        }
        const sendFrom2To1 = async () => {
            return endpoint2.send('node-1', JSON.stringify({
                hello: 'world'
            }))
        }
        const sendTasks = []
        for (let i = 0; i < 10; ++i) {
            const time = 10 * i
            sendTasks.push(Promise.all([
                wait(time).then(sendFrom1To2),
                wait(time + 5).then(sendFrom2To1)
            ]))
        }

        await waitForCondition(() => ep1NumOfReceivedMessages === 10)
        await waitForCondition(() => ep2NumOfReceivedMessages === 10)
        await Promise.all(sendTasks)
    })

    it('cannot send too large of a payload', async () => {
        const payload = new Array(2 ** 21).fill('X').join('')
        await endpoint1.connect('node-2', 'tracker')
        await expect(async () => {
            await endpoint1.send('node-2', payload)
        }).rejects.toThrow(/Dropping message due to size 2097152 exceeding the limit of \d+/)
    })

    it('can handle fast paced reconnects', async () => {
        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED),
            endpoint1.connect('node-2', 'tracker', true),
            endpoint2.connect('node-1', 'tracker', false),
        ])

        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED),
            endpoint1.close('node-2', 'test'),
            endpoint1.connect('node-2', 'tracker', true),
        ])
    })

    it('messages are delivered on temporary loss of connectivity', async () => {
        await Promise.all([
            waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
            waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED),
            endpoint1.connect('node-2', 'tracker'),
            endpoint2.connect('node-1', 'tracker'),
        ])

        let ep2NumOfReceivedMessages = 0

        endpoint2.on(EndpointEvent.MESSAGE_RECEIVED, () => {
            ep2NumOfReceivedMessages += 1
        })

        const sendFrom1To2 = async (msg: any) => {
            return endpoint1.send('node-2', JSON.stringify(msg))
        }
        const sendTasks = []
        const NUM_MESSAGES = 6

        async function reconnect() {
            await Promise.all([
                waitForEvent(endpoint1, EndpointEvent.PEER_DISCONNECTED),
                endpoint2.close('node-1', 'temporary loss of connectivity test')
            ])
            await Promise.all([
                endpoint1.connect('node-2', 'tracker'),
                endpoint2.connect('node-1', 'tracker'),
            ])
        }

        let onReconnect
        for (let i = 1; i <= NUM_MESSAGES; ++i) {
            sendTasks.push(sendFrom1To2({
                value: `${i} of ${NUM_MESSAGES}`
            }))

            if (i === 3) {
                // eslint-disable-next-line no-await-in-loop
                await waitForCondition(() => ep2NumOfReceivedMessages === 3)
                onReconnect = reconnect()
            }
        }

        await onReconnect
        await waitForCondition(() => (
            ep2NumOfReceivedMessages === 6
        ), 10000, 500, () => `ep2NumOfReceivedMessages = ${ep2NumOfReceivedMessages}`)
        // all send tasks completed
        await Promise.allSettled(sendTasks)
        await Promise.all(sendTasks)
        expect(sendTasks).toHaveLength(NUM_MESSAGES)
    }, 30 * 1000)
})
