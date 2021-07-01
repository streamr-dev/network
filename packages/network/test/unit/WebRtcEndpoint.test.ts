import { MetricsContext, startTracker } from '../../src/composition'
import { startEndpoint } from '../../src/connection/WebSocketEndpoint'
import { TrackerNode } from '../../src/protocol/TrackerNode'
import { Tracker, Event as TrackerEvent } from '../../src/logic/Tracker'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { waitForCondition, waitForEvent, wait, runAndWaitForEvents } from 'streamr-test-utils'
import { Event as EndpointEvent } from '../../src/connection/IWebRtcEndpoint'
import { RtcSignaller } from '../../src/logic/RtcSignaller'
import { NegotiatedProtocolVersions } from "../../src/connection/NegotiatedProtocolVersions"
import { WebRtcEndpoint } from '../../src/connection/WebRtcEndpoint'
import { NodeWebRtcConnectionFactory } from "../../src/connection/NodeWebRtcConnection"

describe('WebRtcEndpoint', () => {
    let tracker: Tracker
    let trackerNode1: TrackerNode
    let trackerNode2: TrackerNode
    let endpoint1: WebRtcEndpoint
    let endpoint2: WebRtcEndpoint

    describe.each([
        NodeWebRtcConnectionFactory // TODO: add web-version when done
    ])('when configured with %s', (factory) => {

        beforeEach(async () => {
            tracker = await startTracker({
                host: '127.0.0.1',
                port: 28800,
                id: 'tracker'
            })

            const ep1 = await startEndpoint('127.0.0.1', 28801, PeerInfo.newNode('node-1'), undefined, new MetricsContext(''))
            const ep2 = await startEndpoint('127.0.0.1', 28802, PeerInfo.newNode('node-2'), undefined, new MetricsContext(''))
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
            endpoint1 = new WebRtcEndpoint(
                peerInfo1,
                ["stun:stun.l.google.com:19302"],
                new RtcSignaller(peerInfo1, trackerNode1),
                new MetricsContext(''),
                new NegotiatedProtocolVersions(peerInfo1),
                factory
            )
            endpoint2 = new WebRtcEndpoint(
                peerInfo2,
                ["stun:stun.l.google.com:19302"],
                new RtcSignaller(peerInfo2, trackerNode2),
                new MetricsContext(''),
                new NegotiatedProtocolVersions(peerInfo2),
                factory
            )
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

        it('connection between nodes is established when both nodes invoke tracker-instructed connect()', async () => {
            await runAndWaitForEvents([
                () => {
                    endpoint1.connect('node-2', 'tracker', true)
                },
                () => {
                    endpoint2.connect('node-1', 'tracker', true)
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
                endpoint1.connect('node-2', 'tracker', false),
                endpoint2.connect('node-1', 'tracker', false)
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
                endpoint1.connect('node-2', 'tracker', true),
                endpoint2.connect('node-1', 'tracker', false)
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
                endpoint1.connect('node-2', 'tracker', false),
                endpoint2.connect('node-1', 'tracker', true)
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
                    endpoint1.connect('node-2', 'tracker')
                },
                () => {
                    endpoint2.connect('node-1', 'tracker')
                }], [
                [endpoint1, EndpointEvent.PEER_CONNECTED],
                [endpoint2, EndpointEvent.PEER_CONNECTED]
            ], 30000)

            await runAndWaitForEvents([
                () => {
                    endpoint1.close('node-2', 'test')
                },
                () => {
                    endpoint1.connect('node-2', 'tracker')
                }], [
                [endpoint1, EndpointEvent.PEER_CONNECTED],
                [endpoint2, EndpointEvent.PEER_CONNECTED]
            ], 30000)

            await runAndWaitForEvents([
                () => {
                    endpoint2.close('node-1', 'test')
                },
                () => {
                    endpoint2.connect('node-1', 'tracker', false)
                }], [
                [endpoint1, EndpointEvent.PEER_CONNECTED],
                [endpoint2, EndpointEvent.PEER_CONNECTED]
            ], 30000)

        }, 60000)

        it('messages are delivered on temporary loss of connectivity', async () => {
            await runAndWaitForEvents([
                () => {
                    endpoint1.connect('node-2', 'tracker')
                },
                () => {
                    endpoint2.connect('node-1', 'tracker')
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
                        endpoint1.connect('node-2', 'tracker')
                    },
                    () => {
                        endpoint2.connect('node-1', 'tracker')
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
        
    })
})
