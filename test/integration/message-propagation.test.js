const Node = require('../../src/logic/Node')
const DataMessage = require('../../src/messages/DataMessage')
const { StreamID, MessageID, MessageReference } = require('../../src/identifiers')
const { startTracker, startNode } = require('../../src/composition')
const { callbackToPromise } = require('../../src/util')
const { waitForCondition, LOCALHOST } = require('../../test/util')

jest.setTimeout(90000)

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

    afterAll(async (done) => {
        await callbackToPromise(n1.stop.bind(n1))
        await callbackToPromise(n1.stop.bind(n2))
        await callbackToPromise(n1.stop.bind(n3))
        await callbackToPromise(n1.stop.bind(n4))
        tracker.stop(done)
    })

    it('messages are delivered to nodes in the network according to stream subscriptions', async () => {
        const n1Messages = []
        const n2Messages = []
        const n3Messages = []
        const n4Messages = []

        n1.on(Node.events.MESSAGE_PROPAGATED, (dataMessage) => n1Messages.push({
            streamId: dataMessage.getMessageId().streamId,
            payload: dataMessage.getData()
        }))
        n2.on(Node.events.MESSAGE_PROPAGATED, (dataMessage) => n2Messages.push({
            streamId: dataMessage.getMessageId().streamId,
            payload: dataMessage.getData()
        }))
        n3.on(Node.events.MESSAGE_PROPAGATED, (dataMessage) => n3Messages.push({
            streamId: dataMessage.getMessageId().streamId,
            payload: dataMessage.getData()
        }))
        n4.on(Node.events.MESSAGE_PROPAGATED, (dataMessage) => n4Messages.push({
            streamId: dataMessage.getMessageId().streamId,
            payload: dataMessage.getData()
        }))

        n2.subscribeToStreamIfHaveNotYet(new StreamID('stream-1', 0))
        n3.subscribeToStreamIfHaveNotYet(new StreamID('stream-1', 0))

        for (let i = 1; i <= 5; ++i) {
            const dataMessage = new DataMessage(
                new MessageID(new StreamID('stream-1', 0), i, 0, 'publisher-id', 'sessionId'),
                i === 1 ? null : new MessageReference(i - 1, 0),
                {
                    messageNo: i
                }
            )
            n1.onDataReceived(dataMessage)

            const dataMessage2 = new DataMessage(
                new MessageID(new StreamID('stream-2', 0), i * 100, 0, 'publisher-id', 'sessionId'),
                i === 1 ? null : new MessageReference((i - 1) * 100, 0),
                {
                    messageNo: i * 100
                }
            )
            n4.onDataReceived(dataMessage2)
        }

        await waitForCondition(() => n1Messages.length === 5)
        await waitForCondition(() => n2Messages.length === 5)
        await waitForCondition(() => n3Messages.length === 5)

        expect(n1Messages).toEqual([
            {
                streamId: new StreamID('stream-1', 0),
                payload: {
                    messageNo: 1
                }
            },
            {
                streamId: new StreamID('stream-1', 0),
                payload: {
                    messageNo: 2
                }
            },
            {
                streamId: new StreamID('stream-1', 0),
                payload: {
                    messageNo: 3
                }
            },
            {
                streamId: new StreamID('stream-1', 0),
                payload: {
                    messageNo: 4
                }
            },
            {
                streamId: new StreamID('stream-1', 0),
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
