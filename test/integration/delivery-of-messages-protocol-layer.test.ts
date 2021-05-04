import { MessageLayer, ControlLayer, TrackerLayer } from 'streamr-client-protocol'
import { waitForEvent } from 'streamr-test-utils'

import { startEndpoint } from '../../src/connection/WsEndpoint'
import { StreamIdAndPartition } from '../../src/identifiers'
import { NodeToNode, Event as NodeToNodeEvent } from '../../src/protocol/NodeToNode'
import { TrackerNode, Event as TrackerNodeEvent } from '../../src/protocol/TrackerNode'
import { TrackerServer, Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { DescriptionType } from 'node-datachannel'

const { StreamMessage, MessageID, MessageRef } = MessageLayer

const UUID_REGEX = /[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}/

describe('delivery of messages in protocol layer', () => {
    let nodeToNode1: NodeToNode
    let nodeToNode2: NodeToNode
    let trackerNode: TrackerNode
    let trackerServer: TrackerServer

    beforeAll(async () => {
        const wsEndpoint1 = await startEndpoint('127.0.0.1', 28511, PeerInfo.newNode('nodeToNode1'), null)
        const wsEndpoint2 = await startEndpoint('127.0.0.1', 28512, PeerInfo.newNode('nodeToNode2'), null)
        const wsEndpoint3 = await startEndpoint('127.0.0.1', 28513, PeerInfo.newNode('trackerNode'), null)
        const wsEndpoint4 = await startEndpoint('127.0.0.1', 28514, PeerInfo.newTracker('trackerServer'), null)

        nodeToNode1 = new NodeToNode(wsEndpoint1 as any) // TODO: check cast
        nodeToNode2 = new NodeToNode(wsEndpoint2 as any) // TODO: check cast
        trackerNode = new TrackerNode(wsEndpoint3)
        trackerServer = new TrackerServer(wsEndpoint4)

        // Connect nodeToNode1 <-> nodeToNode2
        // @ts-expect-error parameter count
        nodeToNode1.connectToNode(nodeToNode2.getAddress())
        await waitForEvent(nodeToNode2, NodeToNodeEvent.NODE_CONNECTED)

        // Connect trackerNode <-> trackerServer
        trackerNode.connectToTracker(trackerServer.getAddress())
        await waitForEvent(trackerServer, TrackerServerEvent.NODE_CONNECTED)
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
        const streamMessage = new StreamMessage({
            messageId: new MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'),
            prevMsgRef: new MessageRef(665, 0),
            content: {
                hello: 'world'
            },
            messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: 'signature',
        })
        nodeToNode2.sendData('nodeToNode1', streamMessage)
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.DATA_RECEIVED)

        expect(msg).toBeInstanceOf(ControlLayer.BroadcastMessage)
        expect(source).toEqual('nodeToNode2')
        expect(msg.requestId).toEqual('')
        expect(msg.streamMessage.messageId).toEqual(new MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'))
        expect(msg.streamMessage.prevMsgRef).toEqual(new MessageRef(665, 0))
        expect(msg.streamMessage.getParsedContent()).toEqual({
            hello: 'world'
        })
        expect(msg.streamMessage.signatureType).toEqual(MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH)
        expect(msg.streamMessage.signature).toEqual('signature')
    })

    test('sendUnicast is delivered', async () => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'),
            prevMsgRef: new MessageRef(665, 0),
            content: {
                hello: 'world'
            },
            messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
            signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
            signature: 'signature',
        })
        const unicastMessage = new ControlLayer.UnicastMessage({
            requestId: 'requestId',
            streamMessage,
        })
        nodeToNode2.send('nodeToNode1', unicastMessage)
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.UNICAST_RECEIVED)

        expect(msg).toBeInstanceOf(ControlLayer.UnicastMessage)
        expect(source).toEqual('nodeToNode2')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.streamMessage.messageId).toEqual(new MessageID('stream', 10, 666, 0, 'publisherId', 'msgChainId'))
        expect(msg.streamMessage.prevMsgRef).toEqual(new MessageRef(665, 0))
        expect(msg.streamMessage.getParsedContent()).toEqual({
            hello: 'world'
        })
        expect(msg.streamMessage.signature).toEqual('signature')
        expect(msg.streamMessage.signatureType).toEqual(MessageLayer.StreamMessage.SIGNATURE_TYPES.ETH)
        expect(msg.requestId).toEqual('requestId')
    })

    test('sendInstruction is delivered', async () => {
        trackerServer.sendInstruction('trackerNode', new StreamIdAndPartition('stream', 10), ['trackerNode'], 15)
        const [msg, trackerId]: any = await waitForEvent(trackerNode, TrackerNodeEvent.TRACKER_INSTRUCTION_RECEIVED)

        expect(trackerId).toEqual('trackerServer')
        expect(msg).toBeInstanceOf(TrackerLayer.InstructionMessage)
        expect(msg.requestId).toMatch(UUID_REGEX)
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.nodeIds).toEqual(['trackerNode'])
        expect(msg.counter).toEqual(15)
    })

    test('resendLastRequest is delivered', async () => {
        nodeToNode2.send('nodeToNode1', new ControlLayer.ResendLastRequest({
            requestId: 'requestId',
            streamId: 'stream',
            streamPartition: 10,
            numberLast: 100,
            sessionToken: null
        }))
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ControlLayer.ResendLastRequest)
        expect(source).toEqual('nodeToNode2')
        expect(msg.requestId).toMatch('requestId')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
        expect(msg.numberLast).toEqual(100)
    })

    test('requestResendFrom is delivered', async () => {
        nodeToNode2.send('nodeToNode1', new ControlLayer.ResendFromRequest({
            requestId: 'requestId',
            streamId: 'stream',
            streamPartition: 10,
            fromMsgRef: new MessageRef(1, 1),
            publisherId: 'publisherId',
            sessionToken: null
        }))
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ControlLayer.ResendFromRequest)
        expect(source).toEqual('nodeToNode2')
        expect(msg.requestId).toMatch('requestId')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
        expect(msg.fromMsgRef).toEqual(new MessageRef(1, 1))
        expect(msg.publisherId).toEqual('publisherId')
    })

    test('requestResendRange is delivered', async () => {
        nodeToNode2.send('nodeToNode1', new ControlLayer.ResendRangeRequest({
            requestId: 'requestId',
            streamId: 'stream',
            streamPartition: 10,
            fromMsgRef: new MessageRef(1, 1),
            toMsgRef: new MessageRef(2, 2),
            publisherId: 'publisherId',
            msgChainId: 'msgChainId',
            sessionToken: null
        }))
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.RESEND_REQUEST)

        expect(msg).toBeInstanceOf(ControlLayer.ResendRangeRequest)
        expect(source).toEqual('nodeToNode2')
        expect(msg.requestId).toMatch('requestId')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
        expect(msg.fromMsgRef).toEqual(new MessageRef(1, 1))
        expect(msg.toMsgRef).toEqual(new MessageRef(2, 2))
        expect(msg.publisherId).toEqual('publisherId')
        expect(msg.msgChainId).toEqual('msgChainId')
    })

    test('respondResending is delivered', async () => {
        nodeToNode2.send('nodeToNode1', new ControlLayer.ResendResponseResending({
            requestId: 'requestId',
            streamId: 'stream',
            streamPartition: 10,
        }))
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.RESEND_RESPONSE)

        expect(msg).toBeInstanceOf(ControlLayer.ResendResponseResending)
        expect(source).toEqual('nodeToNode2')
        expect(msg.requestId).toMatch('requestId')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
    })

    test('respondResent is delivered', async () => {
        nodeToNode2.send('nodeToNode1', new ControlLayer.ResendResponseResent({
            requestId: 'requestId',
            streamId: 'stream',
            streamPartition: 10,
        }))
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.RESEND_RESPONSE)

        expect(msg).toBeInstanceOf(ControlLayer.ResendResponseResent)
        expect(source).toEqual('nodeToNode2')
        expect(msg.requestId).toMatch('requestId')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
    })

    test('respondNoResend is delivered', async () => {
        nodeToNode2.send('nodeToNode1', new ControlLayer.ResendResponseNoResend({
            requestId: 'requestId',
            streamId: 'stream',
            streamPartition: 10,
        }))
        const [msg, source]: any = await waitForEvent(nodeToNode1, NodeToNodeEvent.RESEND_RESPONSE)

        expect(msg).toBeInstanceOf(ControlLayer.ResendResponseNoResend)
        expect(source).toEqual('nodeToNode2')
        expect(msg.requestId).toMatch('requestId')
        expect(msg.streamId).toEqual('stream')
        expect(msg.streamPartition).toEqual(10)
        expect(msg.requestId).toEqual('requestId')
    })

    test('sendStatus is delivered', async () => {
        trackerNode.sendStatus('trackerServer', {
            // @ts-expect-error missing fields
            status: 'status'
        })
        const [msg, source]: any = await waitForEvent(trackerServer, TrackerServerEvent.NODE_STATUS_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.StatusMessage)
        expect(source).toEqual('trackerNode')
        expect(msg.requestId).toMatch(UUID_REGEX)
        expect(msg.status).toEqual({
            status: 'status'
        })
    })

    test('sendUnknownPeerRtcError is delivered', async () => {
        trackerServer.sendUnknownPeerRtcError('trackerNode', 'requestId', 'unknownTargetNode')
        const [msg, source]: any = await waitForEvent(trackerNode, TrackerNodeEvent.RTC_ERROR_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.ErrorMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.errorCode).toEqual(TrackerLayer.ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER)
        expect(msg.targetNode).toEqual('unknownTargetNode')
    })

    test('sendRtcOffer is delivered (trackerServer->trackerNode)', async () => {
        trackerServer.sendRtcOffer('trackerNode', 'requestId', PeerInfo.newNode('originatorNode'), 'description')
        const [msg, source]: any = await waitForEvent(trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('trackerNode')
        expect(msg.subType).toEqual('rtcOffer')
        expect(msg.data).toEqual({
            description: 'description'
        })
    })

    test('sendRtcAnswer is delivered (trackerServer->trackerNode)', async () => {
        trackerServer.sendRtcAnswer('trackerNode', 'requestId', PeerInfo.newNode('originatorNode'), 'description')
        const [msg, source]: any = await waitForEvent(trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('trackerNode')
        expect(msg.subType).toEqual('rtcAnswer')
        expect(msg.data).toEqual({
            description: 'description'
        })
    })

    test('sendRtcConnect is delivered (trackerServer->trackerNode)', async () => {
        trackerServer.sendRtcConnect('trackerNode', 'requestId', PeerInfo.newNode('originatorNode'), false)
        const [msg, source]: any = await waitForEvent(trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('trackerNode')
        expect(msg.subType).toEqual('rtcConnect')
        expect(msg.data).toEqual({ force: false })
    })

    test('sendRemoteCandidate is delivered (trackerServer->trackerNode)', async () => {
        trackerServer.sendRemoteCandidate('trackerNode', 'requestId', PeerInfo.newNode('originatorNode'), 'candidate', 'mid')
        const [msg, source]: any = await waitForEvent(trackerNode, TrackerNodeEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerServer')
        expect(msg.requestId).toEqual('requestId')
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('trackerNode')
        expect(msg.subType).toEqual('remoteCandidate')
        expect(msg.data).toEqual({
            candidate: 'candidate',
            mid: 'mid'
        })
    })

    test('sendLocalCandidate is delivered (trackerNode->trackerServer)', async () => {
        trackerNode.sendLocalCandidate('trackerServer', 'targetNode', PeerInfo.newNode('originatorNode'), 'candidate', 'mid')
        const [msg, source]: any = await waitForEvent(trackerServer, TrackerServerEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerNode')
        expect(msg.requestId).toMatch(UUID_REGEX)
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('targetNode')
        expect(msg.subType).toEqual('localCandidate')
        expect(msg.data).toEqual({
            candidate: 'candidate',
            mid: 'mid'
        })
    })

    test('sendLocalDescription is delivered (trackerNode->trackerServer)', async () => {
        trackerNode.sendLocalDescription(
            'trackerServer',
            'targetNode',
            PeerInfo.newNode('originatorNode'),
            'offer' as DescriptionType.Offer, // TODO should be able to use the enum directly
            'description'
        )
        const [msg, source]: any = await waitForEvent(trackerServer, TrackerServerEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerNode')
        expect(msg.requestId).toMatch(UUID_REGEX)
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('targetNode')
        expect(msg.subType).toEqual('localDescription')
        expect(msg.data).toEqual({
            type: 'offer',
            description: 'description'
        })
    })

    test('sendRtcConnect is delivered (trackerNode->trackerServer)', async () => {
        trackerNode.sendRtcConnect('trackerServer', 'targetNode', PeerInfo.newNode('originatorNode'), false)
        const [msg, source]: any = await waitForEvent(trackerServer, TrackerServerEvent.RELAY_MESSAGE_RECEIVED)

        expect(msg).toBeInstanceOf(TrackerLayer.RelayMessage)
        expect(source).toEqual('trackerNode')
        expect(msg.requestId).toMatch(UUID_REGEX)
        expect(msg.originator).toEqual(PeerInfo.newNode('originatorNode'))
        expect(msg.targetNode).toEqual('targetNode')
        expect(msg.subType).toEqual('rtcConnect')
        expect(msg.data).toEqual({ force: false })
    })
})
