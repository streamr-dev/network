import { Tracker } from '../../src/logic/Tracker'
import { NetworkNode } from '../../src/NetworkNode'
import { MessageLayer } from 'streamr-client-protocol'
import { waitForCondition, waitForEvent } from 'streamr-test-utils'

import { Event as NodeEvent } from '../../src/logic/Node'
import { startTracker, startNetworkNode } from '../../src/composition'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

describe('message propagation in network', () => {
    let tracker: Tracker
    let n1: NetworkNode
    let n2: NetworkNode
    let n3: NetworkNode
    let n4: NetworkNode

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 33300,
            id: 'tracker'
        })

        await Promise.all([
            startNetworkNode({
                id: 'node-1',
                trackers: [tracker.getAddress()],
                disconnectionWaitTime: 200
            }),
            startNetworkNode({
                id: 'node-2',
                trackers: [tracker.getAddress()],
                disconnectionWaitTime: 200
            }),
            startNetworkNode({
                id: 'node-3',
                trackers: [tracker.getAddress()],
                disconnectionWaitTime: 200
            }),
            startNetworkNode({
                id: 'node-4',
                trackers: [tracker.getAddress()],
                disconnectionWaitTime: 200
            })
        ]).then((res) => {
            [n1, n2, n3, n4] = res
            return res
        });

        [n1, n2, n3, n4].forEach((node) => node.start())
    })

    afterAll(async () => {
        await Promise.allSettled([
            tracker.stop(),
            n1.stop(),
            n2.stop(),
            n3.stop(),
            n4.stop()
        ])
    })

    it('messages are delivered to nodes in the network according to stream subscriptions', async () => {
        const n1Messages: any[] = []
        const n2Messages: any[] = []
        const n3Messages: any[] = []
        const n4Messages: any[] = []

        n1.addMessageListener((streamMessage) => n1Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))
        n2.addMessageListener((streamMessage) => n2Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))
        n3.addMessageListener((streamMessage) => n3Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))
        n4.addMessageListener((streamMessage) => n4Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))

        n2.subscribe('stream-1', 0)
        n3.subscribe('stream-1', 0)

        await Promise.all([
            waitForEvent(n2, NodeEvent.NODE_SUBSCRIBED),
            waitForEvent(n3, NodeEvent.NODE_SUBSCRIBED)
        ])

        for (let i = 1; i <= 5; ++i) {
            n1.publish(new StreamMessage({
                messageId: new MessageID('stream-1', 0, i, 0, 'publisherId', 'msgChainId'),
                prevMsgRef: i === 1 ? null : new MessageRef(i - 1, 0),
                content: {
                    messageNo: i
                },
            }))

            n4.publish(new StreamMessage({
                messageId: new MessageID('stream-2', 0, i * 100, 0, 'publisherId', 'msgChainId'),
                prevMsgRef: i === 1 ? null : new MessageRef((i - 1) * 100, 0),
                content: {
                    messageNo: i * 100
                },
            }))
        }

        await waitForCondition(() => n1Messages.length === 5, 8000)
        await waitForCondition(() => n2Messages.length === 5, 8000)
        await waitForCondition(() => n3Messages.length === 5, 8000)

        expect(n1Messages).toEqual([
            {
                streamId: 'stream-1',
                streamPartition: 0,
                payload: {
                    messageNo: 1
                }
            },
            {
                streamId: 'stream-1',
                streamPartition: 0,
                payload: {
                    messageNo: 2
                }
            },
            {
                streamId: 'stream-1',
                streamPartition: 0,
                payload: {
                    messageNo: 3
                }
            },
            {
                streamId: 'stream-1',
                streamPartition: 0,
                payload: {
                    messageNo: 4
                }
            },
            {
                streamId: 'stream-1',
                streamPartition: 0,
                payload: {
                    messageNo: 5
                }
            }
        ])
        expect(n2Messages).toEqual(n1Messages)
        expect(n3Messages).toEqual(n2Messages)
        expect(n4Messages).toEqual([
            {
                streamId: 'stream-2',
                streamPartition: 0,
                payload: {
                    messageNo: 100
                },
            },
            {
                streamId: 'stream-2',
                streamPartition: 0,
                payload: {
                    messageNo: 200
                },
            },
            {
                streamId: 'stream-2',
                streamPartition: 0,
                payload: {
                    messageNo: 300
                },
            },
            {
                streamId: 'stream-2',
                streamPartition: 0,
                payload: {
                    messageNo: 400
                },
            },
            {
                streamId: 'stream-2',
                streamPartition: 0,
                payload: {
                    messageNo: 500
                },
            }
        ])
    })
})
