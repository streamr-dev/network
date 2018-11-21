const Node = require('../../src/logic/Node')
const NodeToNode = require('../../src/protocol/NodeToNode')
const TrackerNode = require('../../src/protocol/TrackerNode')
const TrackerServer = require('../../src/protocol/TrackerServer')
const DataMessage = require('../../src/messages/DataMessage')
const { startTracker, startNode } = require('../../src/composition')
const { callbackToPromise } = require('../../src/util')
const { wait, waitForEvent, LOCALHOST } = require('../../test/util')

jest.setTimeout(90000)

describe('message propagation in network', () => {
    let tracker
    let n1
    let n2
    let n3
    let n4
    const BOOTNODES = []

    beforeAll(async () => {
        tracker = await startTracker(LOCALHOST, 33300, 'tracker')
        BOOTNODES.push(tracker.getAddress())

        await Promise.all([
            startNode('127.0.0.1', 33312, 'node-1'),
            startNode('127.0.0.1', 33313, 'node-2'),
            startNode('127.0.0.1', 33314, 'node-3'),
            startNode('127.0.0.1', 33315, 'node-4')
        ]).then((res) => {
            [n1, n2, n3, n4] = res
            n1.setBootstrapTrackers(BOOTNODES)
            n2.setBootstrapTrackers(BOOTNODES)
            n3.setBootstrapTrackers(BOOTNODES)
            n4.setBootstrapTrackers(BOOTNODES)
        })

        await Promise.all([
            waitForEvent(n1.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(n2.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(n3.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED),
            waitForEvent(n4.protocols.trackerNode, TrackerNode.events.NODE_LIST_RECEIVED)
        ])
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

        n1.on(Node.events.MESSAGE_RECEIVED, (dataMessage) => n1Messages.push({
            streamId: dataMessage.getStreamId(),
            payload: dataMessage.getData()
        }))
        n2.on(Node.events.MESSAGE_RECEIVED, (dataMessage) => n2Messages.push({
            streamId: dataMessage.getStreamId(),
            payload: dataMessage.getData()
        }))
        n3.on(Node.events.MESSAGE_RECEIVED, (dataMessage) => n3Messages.push({
            streamId: dataMessage.getStreamId(),
            payload: dataMessage.getData()
        }))
        n4.on(Node.events.MESSAGE_RECEIVED, (dataMessage) => n4Messages.push({
            streamId: dataMessage.getStreamId(),
            payload: dataMessage.getData()
        }))

        n2.subscribeToStream('stream-1')
        await waitForEvent(tracker.protocols.trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        n3.subscribeToStream('stream-1')
        await waitForEvent(n2.protocols.nodeToNode, NodeToNode.events.SUBSCRIBE_REQUEST)

        for (let i = 0; i < 5; ++i) {
            const dataMessage = new DataMessage('stream-1', {
                messageNo: i
            }, i, i - 1)
            n1.onDataReceived(dataMessage)

            const dataMessage2 = new DataMessage('stream-2', {
                messageNo: i * 100
            }, i * 100, (i - 1) * 100)
            n4.onDataReceived(dataMessage2)

            // eslint-disable-next-line no-await-in-loop
            await wait(500)
        }

        expect(n1Messages).toEqual([])
        expect(n2Messages).toEqual([
            {
                streamId: 'stream-1',
                payload: {
                    messageNo: 0
                }
            },
            {
                streamId: 'stream-1',
                payload: {
                    messageNo: 1
                }
            },
            {
                streamId: 'stream-1',
                payload: {
                    messageNo: 2
                }
            },
            {
                streamId: 'stream-1',
                payload: {
                    messageNo: 3
                }
            },
            {
                streamId: 'stream-1',
                payload: {
                    messageNo: 4
                }
            }
        ])
        expect(n3Messages).toEqual(n2Messages)
        expect(n4Messages).toEqual([])
    })
})
