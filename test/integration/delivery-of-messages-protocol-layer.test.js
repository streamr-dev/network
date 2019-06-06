const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const { waitForEvent } = require('../util')
const { startWebSocketServer, WsEndpoint } = require('../../src/connection/WsEndpoint')
const { MessageReference, StreamID } = require('../../src/identifiers')
const NodeToNode = require('../../src/protocol/NodeToNode')
const TrackerNode = require('../../src/protocol/TrackerNode')
const TrackerServer = require('../../src/protocol/TrackerServer')
const FindStorageNodesMessage = require('../../src/messages/FindStorageNodesMessage')
const InstructionMessage = require('../../src/messages/InstructionMessage')
const ResendLastRequest = require('../../src/messages/ResendLastRequest')
const ResendFromRequest = require('../../src/messages/ResendFromRequest')
const ResendRangeRequest = require('../../src/messages/ResendRangeRequest')
const ResendResponseResent = require('../../src/messages/ResendResponseResent')
const ResendResponseResending = require('../../src/messages/ResendResponseResending')
const ResendResponseNoResend = require('../../src/messages/ResendResponseNoResend')
const StatusMessage = require('../../src/messages/StatusMessage')
const StorageNodesMessage = require('../../src/messages/StorageNodesMessage')
const SubscribeMessage = require('../../src/messages/SubscribeMessage')
const UnsubscribeMessage = require('../../src/messages/UnsubscribeMessage')
const { peerTypes } = require('../../src/protocol/PeerBook')

const { StreamMessage } = MessageLayer

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
            'streamr-peer-type': peerTypes.NODE
        }))

        nodeToNode2 = new NodeToNode(new WsEndpoint(wss2, {
            'streamr-peer-id': 'nodeToNode2',
            'streamr-peer-type': peerTypes.NODE
        }))

        trackerNode = new TrackerNode(new WsEndpoint(wss3, {
            'streamr-peer-id': 'trackerNode',
            'streamr-peer-type': peerTypes.NODE
        }))

        trackerServer = new TrackerServer(new WsEndpoint(wss4, {
            'streamr-peer-id': 'trackerServer',
            'streamr-peer-type': peerTypes.NODE
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
            nodeToNode2.stop(),
            nodeToNode1.stop(),
            trackerNode.stop(),
            trackerServer.stop()
        ])
    })

    test('sendData is delivered', async () => {
        const streamMessage = StreamMessage.create(['stream', 10, 666, 0, 'publisherId', 'msgChainId'],
            [665, 0], StreamMessage.CONTENT_TYPES.JSON, {
                hello: 'world'
            }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature')
        nodeToNode2.sendData('nodeToNode1', streamMessage)
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.DATA_RECEIVED)

        expect(msg).toBeInstanceOf(StreamMessage)
        expect(source).toEqual('nodeToNode2')
        expect(msg.messageId).toEqual(new MessageLayer.MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'))
        expect(msg.prevMsgRef).toEqual(new MessageLayer.MessageRef(665, 0))
        expect(msg.getParsedContent()).toEqual({
            hello: 'world'
        })
        expect(msg.signatureType).toEqual(MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH)
        expect(msg.signature).toEqual('signature')
    })

    test('sendUnicast is delivered', async () => {
        const streamMessage = MessageLayer.StreamMessage.create(['stream', 10, 666, 0, 'publisherId', 'msgChainId'],
            [665, 0], MessageLayer.StreamMessage.CONTENT_TYPES.JSON, {
                hello: 'world'
            }, 1, 'signature')
        const unicastMessage = ControlLayer.UnicastMessage.create('subId', streamMessage)
        nodeToNode2.sendUnicast('nodeToNode1', unicastMessage)
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.UNICAST_RECEIVED)

        expect(msg).toBeInstanceOf(ControlLayer.UnicastMessage)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamMessage.messageId).toEqual(new MessageLayer.MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'))
        expect(msg.streamMessage.prevMsgRef).toEqual(new MessageLayer.MessageRef(665, 0))
        expect(msg.streamMessage.getParsedContent()).toEqual({
            hello: 'world'
        })
        expect(msg.streamMessage.signature).toEqual('signature')
        expect(msg.streamMessage.signatureType).toEqual(1)
        expect(msg.subId).toEqual('subId')
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
            new MessageReference(1, 1), 'publisherId', 'msgChainId')
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ResendFromRequest)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getSubId()).toEqual('subId')
        expect(msg.getFromMsgRef()).toEqual(new MessageReference(1, 1))
        expect(msg.getPublisherId()).toEqual('publisherId')
        expect(msg.getMsgChainId()).toEqual('msgChainId')
    })

    test('requestResendRange is delivered', async () => {
        nodeToNode2.requestResendRange('nodeToNode1', new StreamID('stream', 10), 'subId',
            new MessageReference(1, 1), new MessageReference(2, 2), 'publisherId', 'msgChainId')
        const [msg] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ResendRangeRequest)
        expect(msg.getSource()).toEqual('nodeToNode2')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getSubId()).toEqual('subId')
        expect(msg.getFromMsgRef()).toEqual(new MessageReference(1, 1))
        expect(msg.getToMsgRef()).toEqual(new MessageReference(2, 2))
        expect(msg.getPublisherId()).toEqual('publisherId')
        expect(msg.getMsgChainId()).toEqual('msgChainId')
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
        const [message] = await waitForEvent(trackerServer, TrackerServer.events.NODE_STATUS_RECEIVED)
        const msg = message.statusMessage

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

    test('findStorageNodes is delivered', async () => {
        trackerNode.findStorageNodes('trackerServer', new StreamID('stream', 10))
        const [msg] = await waitForEvent(trackerServer, TrackerServer.events.FIND_STORAGE_NODES_REQUEST)

        expect(msg).toBeInstanceOf(FindStorageNodesMessage)
        expect(msg.getSource()).toEqual('trackerNode')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
    })

    test('sendStorageNodes is delivered', async () => {
        trackerServer.sendStorageNodes('trackerNode', new StreamID('stream', 10), ['trackerNode'])
        const [msg] = await waitForEvent(trackerNode, TrackerNode.events.STORAGE_NODES_RECEIVED)

        expect(msg).toBeInstanceOf(StorageNodesMessage)
        expect(msg.getSource()).toEqual('trackerServer')
        expect(msg.getStreamId()).toEqual(new StreamID('stream', 10))
        expect(msg.getNodeAddresses()).toEqual(['ws://127.0.0.1:28513'])
    })
})
