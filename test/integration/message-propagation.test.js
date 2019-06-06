const { MessageLayer } = require('streamr-client-protocol')
const Node = require('../../src/logic/Node')
const { StreamID } = require('../../src/identifiers')
const { startTracker, startNode } = require('../../src/composition')
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
            startNode('127.0.0.1', 33312, 'node-1'),
            startNode('127.0.0.1', 33313, 'node-2'),
            startNode('127.0.0.1', 33314, 'node-3'),
            startNode('127.0.0.1', 33315, 'node-4')
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

        n1.on(Node.events.MESSAGE_PROPAGATED, (streamMessage) => n1Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))
        n2.on(Node.events.MESSAGE_PROPAGATED, (streamMessage) => n2Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))
        n3.on(Node.events.MESSAGE_PROPAGATED, (streamMessage) => n3Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))
        n4.on(Node.events.MESSAGE_PROPAGATED, (streamMessage) => n4Messages.push({
            streamId: streamMessage.messageId.streamId,
            streamPartition: streamMessage.messageId.streamPartition,
            payload: streamMessage.getParsedContent()
        }))

        n2.subscribeToStreamIfHaveNotYet(new StreamID('stream-1', 0))
        n3.subscribeToStreamIfHaveNotYet(new StreamID('stream-1', 0))

        for (let i = 1; i <= 5; ++i) {
            const streamMessage = StreamMessage.create(['stream-1', 0, i, 0, 'publisher-id', 'sessionId'],
                i === 1 ? null : [i - 1, 0], StreamMessage.CONTENT_TYPES.JSON, {
                    messageNo: i
                }, StreamMessage.SIGNATURE_TYPES.NONE, null)
            n1.onDataReceived(streamMessage)

            const streamMessage2 = StreamMessage.create(['stream-2', 0, i * 100, 0, 'publisher-id', 'sessionId'],
                i === 1 ? null : [(i - 1) * 100, 0], StreamMessage.CONTENT_TYPES.JSON, {
                    messageNo: i * 100
                }, StreamMessage.SIGNATURE_TYPES.NONE, null)
            n4.onDataReceived(streamMessage2)
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
