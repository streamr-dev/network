const { StreamMessage, MessageID, MessageRef } = require('streamr-client-protocol').MessageLayer
const { waitForCondition } = require('streamr-test-utils')

const { startTracker, startNetworkNode } = require('../../src/composition')

describe('message propagation in network', () => {
    let tracker
    let n1
    let n2
    let n3
    let n4

    beforeAll(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: 33300,
            id: 'tracker'
        })

        await Promise.all([
            startNetworkNode({
                host: '127.0.0.1',
                port: 33312,
                id: 'node-1',
                trackers: [tracker.getAddress()]
            }),
            startNetworkNode({
                host: '127.0.0.1',
                port: 33313,
                id: 'node-2',
                trackers: [tracker.getAddress()]
            }),
            startNetworkNode({
                host: '127.0.0.1',
                port: 33314,
                id: 'node-3',
                trackers: [tracker.getAddress()]
            }),
            startNetworkNode({
                host: '127.0.0.1',
                port: 33315,
                id: 'node-4',
                trackers: [tracker.getAddress()]
            })
        ]).then((res) => {
            [n1, n2, n3, n4] = res
            return res
        });

        [n1, n2, n3, n4].forEach((node) => node.start())
    })

    afterAll(async () => {
        await n1.stop()
        await n2.stop()
        await n3.stop()
        await n4.stop()
        await tracker.stop()
    })

    it('messages are delivered to nodes in the network according to stream subscriptions', async () => {
        const n1Messages = []
        const n2Messages = []
        const n3Messages = []
        const n4Messages = []

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

        await waitForCondition(() => n1Messages.length === 5)
        await waitForCondition(() => n2Messages.length === 5)
        await waitForCondition(() => n3Messages.length === 5)

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
