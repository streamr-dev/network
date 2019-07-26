const { MessageLayer } = require('streamr-client-protocol')

const { startTracker, startNetworkNode } = require('../../src/composition')
const { waitForCondition, LOCALHOST } = require('../../test/util')

const { StreamMessage } = MessageLayer

describe('message propagation in network', () => {
    let tracker
    let n1
    let n2
    let n3
    let n4

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 33300, 'tracker')

        await Promise.all([
            startNetworkNode('127.0.0.1', 33312, 'node-1'),
            startNetworkNode('127.0.0.1', 33313, 'node-2'),
            startNetworkNode('127.0.0.1', 33314, 'node-3'),
            startNetworkNode('127.0.0.1', 33315, 'node-4')
        ]).then((res) => {
            [n1, n2, n3, n4] = res
        });

        [n1, n2, n3, n4].forEach((node) => node.addBootstrapTracker(tracker.getAddress()))
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
            n1.publish(
                'stream-1',
                0,
                i,
                0,
                'publisherId',
                'msgChainId',
                i === 1 ? null : i - 1,
                i === 1 ? null : 0,
                {
                    messageNo: i
                },
                StreamMessage.SIGNATURE_TYPES.NONE,
                null
            )

            n4.publish(
                'stream-2',
                0,
                i * 100,
                0,
                'publisherId',
                'msgChainId',
                i === 1 ? null : (i - 1) * 100,
                i === 1 ? null : 0,
                {
                    messageNo: i * 100
                },
                StreamMessage.SIGNATURE_TYPES.NONE,
                null
            )
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
        expect(n4Messages).toEqual([])
    })
})
