const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const { waitForCondition } = require('streamr-test-utils')

const { startTracker, startNetworkNode } = require('../../src/composition')
const { LOCALHOST } = require('../../test/util')

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
            n1.publish(StreamMessage.from({
                streamId: 'stream-1',
                streamPartition: 0,
                timestamp: i,
                sequenceNumber: 0,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                previousTimestamp: i === 1 ? null : i - 1,
                previousSequenceNumber: i === 1 ? null : 0,
                contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                content: {
                    messageNo: i
                },
                signatureType: StreamMessage.SIGNATURE_TYPES.NONE
            }))

            n4.publish(StreamMessage.from({
                streamId: 'stream-2',
                streamPartition: 0,
                timestamp: i * 100,
                sequenceNumber: 0,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                previousTimestamp: i === 1 ? null : (i - 1) * 100,
                previousSequenceNumber: i === 1 ? null : 0,
                contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                content: {
                    messageNo: i * 100
                },
                signatureType: StreamMessage.SIGNATURE_TYPES.NONE
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
