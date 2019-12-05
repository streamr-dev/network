const { MessageLayer, ControlLayer } = require('streamr-client-protocol')
const { waitForEvent } = require('streamr-test-utils')

const { startWebSocketServer, WsEndpoint } = require('../../src/connection/WsEndpoint')
const { StreamIdAndPartition } = require('../../src/identifiers')
const BasicProtocol = require('../../src/protocol/BasicProtocol')
const NodeToNode = require('../../src/protocol/NodeToNode')
const TrackerNode = require('../../src/protocol/TrackerNode')
const TrackerServer = require('../../src/protocol/TrackerServer')
const FindStorageNodesMessage = require('../../src/messages/FindStorageNodesMessage')
const InstructionMessage = require('../../src/messages/InstructionMessage')
const StatusMessage = require('../../src/messages/StatusMessage')
const StorageNodesMessage = require('../../src/messages/StorageNodesMessage')
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

        nodeToNode1 = new NodeToNode(new BasicProtocol(new WsEndpoint(wss1, {
            'streamr-peer-id': 'nodeToNode1',
            'streamr-peer-type': peerTypes.NODE
        }, null)))

        nodeToNode2 = new NodeToNode(new BasicProtocol(new WsEndpoint(wss2, {
            'streamr-peer-id': 'nodeToNode2',
            'streamr-peer-type': peerTypes.NODE
        }, null)))

        trackerNode = new TrackerNode(new BasicProtocol(new WsEndpoint(wss3, {
            'streamr-peer-id': 'trackerNode',
            'streamr-peer-type': peerTypes.NODE
        }, null)))

        trackerServer = new TrackerServer(new BasicProtocol(new WsEndpoint(wss4, {
            'streamr-peer-id': 'trackerServer',
            'streamr-peer-type': peerTypes.NODE
        }, null)))

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
        const streamMessage = StreamMessage.create(
            ['stream', 10, 666, 0, 'publisherId', 'msgChainId'],
            [665, 0],
            StreamMessage.CONTENT_TYPES.MESSAGE,
            StreamMessage.ENCRYPTION_TYPES.NONE,
            {
                hello: 'world'
            },
            StreamMessage.SIGNATURE_TYPES.ETH,
            'signature'
        )
        nodeToNode2.sendData('nodeToNode1', streamMessage)
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.DATA_RECEIVED)

        expect(msg).toBeInstanceOf(ControlLayer.BroadcastMessage)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamMessage.messageId).toEqual(new MessageLayer.MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'))
        expect(msg.streamMessage.prevMsgRef).toEqual(new MessageLayer.MessageRef(665, 0))
        expect(msg.streamMessage.getParsedContent()).toEqual({
            hello: 'world'
        })
        expect(msg.streamMessage.signatureType).toEqual(MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH)
        expect(msg.streamMessage.signature).toEqual('signature')
    })

    test('sendUnicast is delivered', async () => {
        const streamMessage = MessageLayer.StreamMessage.create(
            ['stream', 10, 666, 0, 'publisherId', 'msgChainId'],
            [665, 0],
            StreamMessage.CONTENT_TYPES.MESSAGE,
            StreamMessage.ENCRYPTION_TYPES.NONE,
            {
                hello: 'world'
            },
            StreamMessage.SIGNATURE_TYPES.ETH_LEGACY,
            'signature'
        )
        const unicastMessage = ControlLayer.UnicastMessage.create('requestId', streamMessage)
        nodeToNode2.send('nodeToNode1', unicastMessage)
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
        expect(msg.requestId).toEqual('requestId')
    })

    test('sendInstruction is delivered', async () => {
        trackerServer.sendInstruction('trackerNode', new StreamIdAndPartition('stream', 10), ['trackerNode'])
        const [msg] = await waitForEvent(trackerNode, TrackerNode.events.TRACKER_INSTRUCTION_RECEIVED)

        expect(msg).toBeInstanceOf(InstructionMessage)
        expect(msg.getSource()).toEqual('trackerServer')
        expect(msg.getStreamId()).toEqual(new StreamIdAndPartition('stream', 10))
        expect(msg.getNodeAddresses()).toEqual(['ws://127.0.0.1:28513'])
    })

    test('resendLastRequest is delivered', async () => {
        nodeToNode2.send('nodeToNode1', ControlLayer.ResendLastRequest.create('stream', 10, 'requestId', 100))
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ControlLayer.ResendLastRequest)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
        expect(msg.numberLast).toEqual(100)
    })

    test('requestResendFrom is delivered', async () => {
        nodeToNode2.send('nodeToNode1',
            ControlLayer.ResendFromRequest.create('stream', 10, 'requestId', [1, 1], 'publisherId', 'msgChainId'))
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ControlLayer.ResendFromRequest)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
        expect(msg.fromMsgRef).toEqual(new MessageLayer.MessageRef(1, 1))
        expect(msg.publisherId).toEqual('publisherId')
        expect(msg.msgChainId).toEqual('msgChainId')
    })

    test('requestResendRange is delivered', async () => {
        nodeToNode2.send('nodeToNode1',
            ControlLayer.ResendRangeRequest.create('stream', 10, 'requestId', [1, 1], [2, 2], 'publisherId', 'msgChainId'))
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ControlLayer.ResendRangeRequest)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
        expect(msg.fromMsgRef).toEqual(new MessageLayer.MessageRef(1, 1))
        expect(msg.toMsgRef).toEqual(new MessageLayer.MessageRef(2, 2))
        expect(msg.publisherId).toEqual('publisherId')
        expect(msg.msgChainId).toEqual('msgChainId')
    })

    test('respondResending is delivered', async () => {
        nodeToNode2.send('nodeToNode1', ControlLayer.ResendResponseResending.create('stream', 10, 'requestId'))
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_RESPONSE)

        expect(msg).toBeInstanceOf(ControlLayer.ResendResponseResending)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
    })

    test('respondResent is delivered', async () => {
        nodeToNode2.send('nodeToNode1', ControlLayer.ResendResponseResent.create('stream', 10, 'requestId'))
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_RESPONSE)

        expect(msg).toBeInstanceOf(ControlLayer.ResendResponseResent)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
    })

    test('respondNoResend is delivered', async () => {
        nodeToNode2.send('nodeToNode1', ControlLayer.ResendResponseNoResend.create('stream', 10, 'requestId'))
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.RESEND_RESPONSE)

        expect(msg).toBeInstanceOf(ControlLayer.ResendResponseNoResend)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
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
        nodeToNode2.sendSubscribe('nodeToNode1', new StreamIdAndPartition('stream', 10))
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.SUBSCRIBE_REQUEST)

        expect(msg).toBeInstanceOf(ControlLayer.SubscribeRequest)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
    })

    test('sendUnsubscribe is delivered', async () => {
        nodeToNode2.sendUnsubscribe('nodeToNode1', new StreamIdAndPartition('stream', 10))
        const [msg, source] = await waitForEvent(nodeToNode1, NodeToNode.events.UNSUBSCRIBE_REQUEST)

        expect(msg).toBeInstanceOf(ControlLayer.UnsubscribeRequest)
        expect(source).toEqual('nodeToNode2')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
    })

    test('findStorageNodes is delivered', async () => {
        trackerNode.findStorageNodes('trackerServer', new StreamIdAndPartition('stream', 10))
        const [msg] = await waitForEvent(trackerServer, TrackerServer.events.FIND_STORAGE_NODES_REQUEST)

        expect(msg).toBeInstanceOf(FindStorageNodesMessage)
        expect(msg.getSource()).toEqual('trackerNode')
        expect(msg.getStreamId()).toEqual(new StreamIdAndPartition('stream', 10))
    })

    test('sendStorageNodes is delivered', async () => {
        trackerServer.sendStorageNodes('trackerNode', new StreamIdAndPartition('stream', 10), ['trackerNode'])
        const [msg] = await waitForEvent(trackerNode, TrackerNode.events.STORAGE_NODES_RECEIVED)

        expect(msg).toBeInstanceOf(StorageNodesMessage)
        expect(msg.getSource()).toEqual('trackerServer')
        expect(msg.getStreamId()).toEqual(new StreamIdAndPartition('stream', 10))
        expect(msg.getNodeAddresses()).toEqual(['ws://127.0.0.1:28513'])
    })
})
