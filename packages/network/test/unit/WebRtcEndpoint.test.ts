import { MetricsContext } from '../../src/composition'
import { NodeToTracker } from '../../src/protocol/NodeToTracker'
import { Tracker, TrackerEvent, startTracker } from '@streamr/network-tracker'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { waitForCondition, waitForEvent, wait, runAndWaitForEvents } from 'streamr-test-utils'
import { Event as EndpointEvent } from '../../src/connection/webrtc/IWebRtcEndpoint'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { NegotiatedProtocolVersions } from '../../src/connection/NegotiatedProtocolVersions'
import { WebRtcEndpoint } from '../../src/connection/webrtc/WebRtcEndpoint'
import NodeWebRtcConnectionFactory from '../../src/connection/webrtc/NodeWebRtcConnection'
import NodeClientWsEndpoint from '../../src/connection/ws/NodeClientWsEndpoint'

describe('WebRtcEndpoint', () => {
    let tracker: Tracker
    let nodeToTracker1: NodeToTracker
    let nodeToTracker2: NodeToTracker
    let endpoint1: WebRtcEndpoint
    let endpoint2: WebRtcEndpoint

    describe.each([
        NodeWebRtcConnectionFactory // TODO: add web-version when done
    ])('when configured with %s', (factory) => {

        beforeEach(async () => {
            tracker = await startTracker({
                listen: {
                    hostname: '127.0.0.1',
                    port: 28800
                }
            })
            const trackerPeerInfo = PeerInfo.newTracker(tracker.getTrackerId())
            const ep1 = await new NodeClientWsEndpoint(PeerInfo.newNode('node-1'))
            const ep2 = await new NodeClientWsEndpoint(PeerInfo.newNode('node-2'))
            nodeToTracker1 = new NodeToTracker(ep1)
            nodeToTracker2 = new NodeToTracker(ep2)
            await runAndWaitForEvents(
                () => { nodeToTracker1.connectToTracker(tracker.getUrl(), trackerPeerInfo) }, [
                    [tracker, TrackerEvent.NODE_CONNECTED]
                ])
            await runAndWaitForEvents(
                () => { nodeToTracker2.connectToTracker(tracker.getUrl(), trackerPeerInfo) }, [
                    [tracker, TrackerEvent.NODE_CONNECTED]
                ])

            const peerInfo1 = PeerInfo.newNode('node-1')
            const peerInfo2 = PeerInfo.newNode('node-2')
            endpoint1 = new WebRtcEndpoint(
                peerInfo1,
                ["stun:stun.l.google.com:19302"],
                new RtcSignaller(peerInfo1, nodeToTracker1),
                new MetricsContext(''),
                new NegotiatedProtocolVersions(peerInfo1),
                factory
            )
            endpoint2 = new WebRtcEndpoint(
                peerInfo2,
                ["stun:stun.l.google.com:19302"],
                new RtcSignaller(peerInfo2, nodeToTracker2),
                new MetricsContext(''),
                new NegotiatedProtocolVersions(peerInfo2),
                factory
            )
        })

        afterEach(async () => {
            await Promise.allSettled([
                tracker.stop(),
                nodeToTracker1.stop(),
                nodeToTracker2.stop(),
                endpoint1.stop(),
                endpoint2.stop()
            ])
        })

        it('connection between nodes is established when both nodes invoke tracker-instructed connect()', async () => {
            await runAndWaitForEvents([
                () => {
                    endpoint1.connect('node-2', tracker.getTrackerId(), true)
                    endpoint2.connect('node-1', tracker.getTrackerId(), true)
                }], [
                [endpoint1, EndpointEvent.PEER_CONNECTED],
                [endpoint2, EndpointEvent.PEER_CONNECTED]
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

        it('connection between nodes is established when both nodes invoke non-tracker-instructed connect()', async () => {
            const promise = Promise.all([
                waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
                waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED)])

            const results = await Promise.allSettled([
                endpoint1.connect('node-2', tracker.getTrackerId(), false),
                endpoint2.connect('node-1', tracker.getTrackerId(), false)
            ])

            await promise

            let oneOpened = false
            results.forEach((result) => {
                if (result.status == 'fulfilled') {
                    oneOpened = true
                }
            })

            expect(oneOpened).toBe(true)

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

        it('connection between nodes is established when node-1 invokes non-tracker-instructed connect()', async () => {
            const promise = Promise.all([
                waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
                waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED)])

            const results = await Promise.allSettled([
                endpoint1.connect('node-2', tracker.getTrackerId(), true),
                endpoint2.connect('node-1', tracker.getTrackerId(), false)
            ])

            await promise

            let oneOpened = false
            results.forEach((result) => {
                if (result.status == 'fulfilled') {
                    oneOpened = true
                }
            })

            expect(oneOpened).toBe(true)

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

        it('connection between nodes is established when node-2 invokes non-tracker-instructed connect()', async () => {
            const promise = Promise.all([
                waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
                waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED)])

            const results = await Promise.allSettled([
                endpoint1.connect('node-2', tracker.getTrackerId(), false),
                endpoint2.connect('node-1', tracker.getTrackerId(), true)
            ])

            await promise

            let oneOpened = false
            results.forEach((result) => {
                if (result.status == 'fulfilled') {
                    oneOpened = true
                }
            })

            expect(oneOpened).toBe(true)

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

        it('can handle fast paced reconnects', async () => {

            await runAndWaitForEvents([
                () => {
                    endpoint1.connect('node-2', tracker.getTrackerId())
                },
                () => {
                    endpoint2.connect('node-1', tracker.getTrackerId())
                }], [
                [endpoint1, EndpointEvent.PEER_CONNECTED],
                [endpoint2, EndpointEvent.PEER_CONNECTED]
            ], 30000)

            await runAndWaitForEvents([
                () => {
                    endpoint1.close('node-2', 'test')
                },
                () => {
                    endpoint1.connect('node-2', tracker.getTrackerId(), false)
                }], [
                [endpoint1, EndpointEvent.PEER_CONNECTED],
                [endpoint2, EndpointEvent.PEER_CONNECTED]
            ], 30000)

            await runAndWaitForEvents([
                () => {
                    endpoint2.close('node-1', 'test')
                },
                () => {
                    endpoint2.connect('node-1', tracker.getTrackerId())
                }], [
                [endpoint1, EndpointEvent.PEER_CONNECTED],
                [endpoint2, EndpointEvent.PEER_CONNECTED]
            ], 30000)

        }, 60000)

        it('messages are delivered on temporary loss of connectivity', async () => {
            await runAndWaitForEvents([
                () => {
                    endpoint1.connect('node-2', tracker.getTrackerId())
                },
                () => {
                    endpoint2.connect('node-1', tracker.getTrackerId())
                }], [
                [endpoint1, EndpointEvent.PEER_CONNECTED],
                [endpoint2, EndpointEvent.PEER_CONNECTED]
            ], 30000)

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
                await runAndWaitForEvents(
                    () => {
                        endpoint2.close('node-1', 'temporary loss of connectivity test')
                    },
                    [endpoint1, EndpointEvent.PEER_DISCONNECTED],
                    30000
                )

                await runAndWaitForEvents([
                    () => {
                        endpoint1.connect('node-2', tracker.getTrackerId())
                    },
                    () => {
                        endpoint2.connect('node-1', tracker.getTrackerId())
                    }],
                [endpoint1, EndpointEvent.PEER_CONNECTED],
                30000
                )
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
                    await Promise.race([
                        wait(1000),
                        onReconnect,
                    ])
                }
            }

            await onReconnect
            await waitForCondition(() => (
                ep2NumOfReceivedMessages === 6
            ), 30000, 500, () => `ep2NumOfReceivedMessages = ${ep2NumOfReceivedMessages}`)
            // all send tasks completed
            await Promise.allSettled(sendTasks)
            await Promise.all(sendTasks)
            expect(sendTasks).toHaveLength(NUM_MESSAGES)
        }, 60 * 1000)

        it('connection between nodes is established when only one node invokes connect()', async () => {
            await Promise.all([
                waitForEvent(endpoint1, EndpointEvent.PEER_CONNECTED),
                waitForEvent(endpoint2, EndpointEvent.PEER_CONNECTED),
                endpoint2.connect('node-1', tracker.getTrackerId())
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
            await endpoint2.connect('node-1', tracker.getTrackerId())
            await expect(async () => {
                await endpoint1.send('node-2', payload)
            }).rejects.toThrow(/Dropping message due to size 2097152 exceeding the limit of \d+/)
        })

    })

    describe('disallow private addresses', () => {
        const createEndpoint = (webrtcDisallowPrivateAddresses: boolean) => {
            const peerInfo = PeerInfo.newNode('node')
            const ep = new NodeClientWsEndpoint(PeerInfo.newNode('node'))
            const nodeToTracker = new NodeToTracker(ep)
            const endpoint = new WebRtcEndpoint(
                peerInfo,
                [],
                new RtcSignaller(peerInfo, nodeToTracker),
                new MetricsContext(''),
                new NegotiatedProtocolVersions(peerInfo),
                NodeWebRtcConnectionFactory,
                15000,    // newConnectionTimeout
                5 * 1000, // pingInternval
                2 ** 15,  // webrtcDatachannelBufferThresholdLow
                2 ** 17,  // webrtcDatachannelBufferThresholdHigh
                webrtcDisallowPrivateAddresses
            )
            return {webRtcEndpoint: endpoint, wsEndpoint: ep, nodeToTracker: nodeToTracker}
        }

        it('does not allow local addresses in ICE candidtates if local address support is disabled', async () => {
            const res = createEndpoint(true)
            const disallowedEndpoint = res.webRtcEndpoint
            expect(disallowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 4134564487 10.9.8.7 4000 typ host'))
                .toBe(false)
            expect(disallowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 4134564487 172.16.1.1 4001 typ host'))
                .toBe(false)
            expect(disallowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 4134564487 192.168.120.3 4002 typ host'))
                .toBe(false)
            expect(disallowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 2122262783 198.51.100.130 4003 typ srflx raddr 0.0.0.0 rport 0'))
                .toBe(true)
            expect(disallowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 8245465162 2001:db8::a72c:ce47:531a:01bc 6000 typ host'))
                .toBe(true)
            expect(disallowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 2122296321 9b36eaac-bb2e-49bb-bb78-21c41c499900.local 7000 typ host'))
                .toBe(true)
            disallowedEndpoint.stop()
            res.nodeToTracker.stop()
            res.wsEndpoint.stop()
        })

        it('allows local addresses in ICE candidtates if local address support is enabled', async () => {
            const res = createEndpoint(false)
            const allowedEndpoint = res.webRtcEndpoint
            expect(allowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 4134564487 10.9.8.7 4000 typ host'))
                .toBe(true)
            expect(allowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 4134564487 172.16.1.1 4001 typ host'))
                .toBe(true)
            expect(allowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 4134564487 192.168.120.3 4002 typ host'))
                .toBe(true)
            expect(allowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 2122262783 198.51.100.130 4001 typ srflx raddr 0.0.0.0 rport 0'))
                .toBe(true)
            expect(allowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 8245465162 2001:db8::a72c:ce47:531a:01bc 6000 typ host'))
                .toBe(true)
            expect(allowedEndpoint
                .isIceCandidateAllowed('candidate:1 1 udp 2122296321 9b36eaac-bb2e-49bb-bb78-21c41c499900.local 7000 typ host'))
                .toBe(true)
            allowedEndpoint.stop()
            res.nodeToTracker.stop()
            res.wsEndpoint.stop()
        })
    })
})

