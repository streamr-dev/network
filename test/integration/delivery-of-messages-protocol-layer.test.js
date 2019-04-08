const { waitForEvent } = require('../util')
const { callbackToPromise } = require('../../src/util')
const { startWebSocketServer, WsEndpoint } = require('../../src/connection/WsEndpoint')
const { MessageID, MessageReference, StreamID } = require('../../src/identifiers')
const NodeToNode = require('../../src/protocol/NodeToNode')
const TrackerNode = require('../../src/protocol/TrackerNode')
const TrackerServer = require('../../src/protocol/TrackerServer')
const DataMessage = require('../../src/messages/DataMessage')
const InstructionMessage = require('../../src/messages/InstructionMessage')
const ResendLastRequest = require('../../src/messages/ResendLastRequest')
const ResendFromRequest = require('../../src/messages/ResendFromRequest')
const ResendRangeRequest = require('../../src/messages/ResendRangeRequest')
const ResendResponseResent = require('../../src/messages/ResendResponseResent')
const ResendResponseResending = require('../../src/messages/ResendResponseResending')
const ResendResponseNoResend = require('../../src/messages/ResendResponseNoResend')
const StatusMessage = require('../../src/messages/StatusMessage')
const SubscribeMessage = require('../../src/messages/SubscribeMessage')
const UnicastMessage = require('../../src/messages/UnicastMessage')
const UnsubscribeMessage = require('../../src/messages/UnsubscribeMessage')

jest.setTimeout(5000)

describe('delivery of messages in protocol layer', () => {
    let nodeToNode1
    let nodeToNode2
    let trackerNode
    let trackerServer

    beforeAll(async () => {
        const wss1 = await startWebSocketServer('127.0.0.1', 28511)
        const wss2 = await startWebSocketServer('127.0.0.1', 28512)
        const wss3 = await startWebSocketServer('127.0.0.1', 28513)
        const wss4 = await startWebSocketServer('127.0.0.1', 28514)

        nodeToNode1 = new NodeToNode(new WsEndpoint(wss1, {
            'streamr-peer-id': 'nodeToNode1',
            'streamr-peer-type': 'node'
        }))

        nodeToNode2 = new NodeToNode(new WsEndpoint(wss2, {
            'streamr-peer-id': 'nodeToNode2',
            'streamr-peer-type': 'node'
        }))

        trackerNode = new TrackerNode(new WsEndpoint(wss3, {
            'streamr-peer-id': 'trackerNode',
            'streamr-peer-type': 'node'
        }))

        trackerServer = new TrackerServer(new WsEndpoint(wss4, {
            'streamr-peer-id': 'trackerServer',
            'streamr-peer-type': 'node'
        }))

        // Connect nodeToNode1 <-> nodeToNode2
        nodeToNode1.connectToNode(nodeToNode2.getAddress())
        await waitForEvent(nodeToNode2, NodeToNode.events.NODE_CONNECTED)

        // Connect trackerNode <-> trackerServer
        trackerNode.connectToTracker(trackerServer.getAddress())
        await waitForEvent(trackerServer, TrackerServer.events.NODE_CONNECTED)
    })

    afterAll(() => {
        return Promise.all([
            callbackToPromise(nodeToNode2.stop.bind(nodeToNode2)),
            callbackToPromise(nodeToNode1.stop.bind(nodeToNode1)),
            callbackToPromise(trackerNode.stop.bind(trackerNode)),
            callbackToPromise(trackerServer.stop.bind(trackerServer))
        ])
    })

    test('sendData is delivered', async () => {
        nodeToNode2.sendData(
            'nodeToNode1',
            new MessageID(new StreamID('stream', 10), 666, 0, 'publisherId', 'msgChainId'),
            new MessageReference(665, 0),
            {
                hello: 'world'
            },
            'signature',
            1
        )
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.DATA_RECEIVED)

        expect(msg).toBeInstanceOf(DataMessage)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getMessageId()).toEqual(new MessageID(new StreamID('stream', 10), 666, 0, 'publisherId', 'msgChainId'))
        expect(msg.getPreviousMessageReference()).toEqual(new MessageReference(665, 0))
        expect(msg.getData()).toEqual({
            hello: 'world'
        })
        expect(msg.getSignature()).toEqual('signature')
        expect(msg.getSignatureType()).toEqual(1)
    })

    test('sendUnicast is delivered', async () => {
        nodeToNode2.sendUnicast(
            'nodeToNode1',
            new MessageID(new StreamID('stream', 10), 666, 0, 'publisherId', 'msgChainId'),
            new MessageReference(665, 0),
            {
                hello: 'world'
            },
            'signature',
            1,
            'subId'
        )
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.UNICAST_RECEIVED)

        expect(msg).toBeInstanceOf(UnicastMessage)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getMessageId()).toEqual(new MessageID(new StreamID('stream', 10), 666, 0, 'publisherId', 'msgChainId'))
        expect(msg.getPreviousMessageReference()).toEqual(new MessageReference(665, 0))
        expect(msg.getData()).toEqual({
            hello: 'world'
        })
        expect(msg.getSignature()).toEqual('signature')
        expect(msg.getSignatureType()).toEqual(1)
        expect(msg.getSubId()).toEqual('subId')
    })

    test('sendInstruction is delivered', async () => {
        trackerServer.sendInstruction('trackerNode', new StreamID('stream', 10), ['trackerNode'])
        const [msg] = await waitForEvent(trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)

        expect(msg).toBeInstanceOf(InstructionMessage)
        expect(msg.getSource()).toEqual('trackerServer')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getNodeAddresses()).toEqual(['ws://127.0.0.1:28513'])
    })

    test('resendLastRequest is delivered', async () => {
        nodeToNode2.requestResendLast('nodeToNode1', new StreamID('stream', 10), 'subId', 100)
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ResendLastRequest)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getSubId()).toEqual('subId')
        expect(msg.getNumberLast()).toEqual(100)
    })

    test('requestResendFrom is delivered', async () => {
        nodeToNode2.requestResendFrom('nodeToNode1', new StreamID('stream', 10), 'subId',
            new MessageReference(1, 1), 'publisherId')
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ResendFromRequest)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getSubId()).toEqual('subId')
        expect(msg.getFromMsgRef()).toEqual(new MessageReference(1, 1))
        expect(msg.getPublisherId()).toEqual('publisherId')
    })

    test('requestResendRange is delivered', async () => {
        nodeToNode2.requestResendRange('nodeToNode1', new StreamID('stream', 10), 'subId',
            new MessageReference(1, 1), new MessageReference(2, 2), 'publisherId')
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ResendRangeRequest)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getSubId()).toEqual('subId')
        expect(msg.getFromMsgRef()).toEqual(new MessageReference(1, 1))
        expect(msg.getToMsgRef()).toEqual(new MessageReference(2, 2))
        expect(msg.getPublisherId()).toEqual('publisherId')
    })

    test('respondResending is delivered', async () => {
        nodeToNode2.respondResending('nodeToNode1', new StreamID('stream', 10), 'subId')
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_RESPONSE)

        expect(msg).toBeInstanceOf(ResendResponseResending)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getSubId()).toEqual('subId')
    })

    test('respondResent is delivered', async () => {
        nodeToNode2.respondResent('nodeToNode1', new StreamID('stream', 10), 'subId')
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_RESPONSE)

        expect(msg).toBeInstanceOf(ResendResponseResent)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getSubId()).toEqual('subId')
    })

    test('respondNoResend is delivered', async () => {
        nodeToNode2.respondNoResend('nodeToNode1', new StreamID('stream', 10), 'subId')
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_RESPONSE)

        expect(msg).toBeInstanceOf(ResendResponseNoResend)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getSubId()).toEqual('subId')
    })

    test('sendStatus is delivered', async () => {
        trackerNode.sendStatus('trackerServer', {
            status: 'status'
        })
        const [msg] = await waitForEvent(trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)

        expect(msg).toBeInstanceOf(StatusMessage)
        expect(msg.getSource()).toEqual('trackerNode')
        expect(msg.getStatus()).toEqual({
            status: 'status'
        })
    })

    test('sendSubscribe is delivered', async () => {
        nodeToNode2.sendSubscribe('nodeToNode1', new StreamID('stream', 10), true)
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.SUBSCRIBE_REQUEST)

        expect(msg).toBeInstanceOf(SubscribeMessage)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getLeechOnly()).toEqual(true)
    })

    test('sendUnsubscribe is delivered', async () => {
        nodeToNode2.sendUnsubscribe('nodeToNode1', new StreamID('stream', 10))
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.UNSUBSCRIBE_REQUEST)

        expect(msg).toBeInstanceOf(UnsubscribeMessage)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
    })
})
