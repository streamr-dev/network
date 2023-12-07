import { v4 } from 'uuid'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { Router } from '../../src/dht/routing/Router'
import { PeerID } from '../../src/helpers/PeerID'
import { 
    Message,
    MessageType,
    NodeType,
    PeerDescriptor,
    RouteMessageAck,
    RouteMessageError,
    RouteMessageWrapper
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { createWrappedClosestPeersRequest } from '../utils/utils'
import { FakeRpcCommunicator } from '../utils/FakeRpcCommunicator'
import { NodeID } from '../../src/helpers/nodeId'

describe('Router', () => {
    let router: Router

    const peerId = PeerID.fromString('router')
    const peerDescriptor1: PeerDescriptor = {
        nodeId: peerId.value,
        type: NodeType.NODEJS
    }
    const peerDescriptor2: PeerDescriptor = {
        nodeId: PeerID.fromString('destination').value,
        type: NodeType.NODEJS
    }
    const rpcWrapper = createWrappedClosestPeersRequest(peerDescriptor1)
    const message: Message = {
        serviceId: 'unknown',
        messageId: v4(),
        messageType: MessageType.RPC,
        body: {
            oneofKind: 'rpcMessage',
            rpcMessage: rpcWrapper
        },
        sourceDescriptor: peerDescriptor1,
        targetDescriptor: peerDescriptor2
    }
    const routedMessage: RouteMessageWrapper = {
        message,
        requestId: 'REQ',
        routingPath: [],
        reachableThrough: [],
        destinationPeer: peerDescriptor1,
        sourcePeer: peerDescriptor2
    }
    let connections: Map<NodeID, DhtNodeRpcRemote>
    const rpcCommunicator = new FakeRpcCommunicator()

    const createMockDhtNodeRpcRemote = (destination: PeerDescriptor): DhtNodeRpcRemote => {
        return new DhtNodeRpcRemote(peerDescriptor1, destination, {} as any, 'router')
    }

    beforeEach(() => {
        connections = new Map()
        router = new Router({
            localPeerDescriptor: peerDescriptor1,
            rpcCommunicator: rpcCommunicator as any,
            addContact: (_contact) => {},
            connections
        })
    })

    afterEach(() => {
        router.stop()
    })

    it('doRouteMessage without connections', async () => {
        const ack = await rpcCommunicator.callRpcMethod('routeMessage', {
            message,
            destinationPeer: peerDescriptor2,
            requestId: v4(),
            sourcePeer: peerDescriptor1,
            reachableThrough: [],
            routingPath: []
        }) as RouteMessageAck
        expect(ack.error).toEqual(RouteMessageError.NO_TARGETS)
    })

    it('doRouteMessage with connections', async () => {
        connections.set(PeerID.fromString('test').toNodeId(), createMockDhtNodeRpcRemote(peerDescriptor2))
        const ack = await rpcCommunicator.callRpcMethod('routeMessage', {
            message,
            destinationPeer: peerDescriptor2,
            requestId: v4(),
            sourcePeer: peerDescriptor1,
            reachableThrough: [],
            routingPath: []
        }) as RouteMessageAck
        expect(ack.error).toBeUndefined()
    })

    it('route server is destination without connections', async () => {
        const ack = await rpcCommunicator.callRpcMethod('routeMessage', routedMessage) as RouteMessageAck
        expect(ack.error).toBeUndefined()
    })

    it('route server with connections', async () => {
        connections.set(PeerID.fromString('test').toNodeId(), createMockDhtNodeRpcRemote(peerDescriptor2))
        const ack = await rpcCommunicator.callRpcMethod('routeMessage', routedMessage) as RouteMessageAck
        expect(ack.error).toBeUndefined()
    })

    it('route server on duplicate message', async () => {
        router.addToDuplicateDetector(routedMessage.requestId)
        const ack = await rpcCommunicator.callRpcMethod('routeMessage', routedMessage) as RouteMessageAck
        expect(ack.error).toEqual(RouteMessageError.DUPLICATE)
    })

    it('forward server no connections', async () => {
        const ack = await rpcCommunicator.callRpcMethod('forwardMessage', routedMessage) as RouteMessageAck
        expect(ack.error).toEqual(RouteMessageError.NO_TARGETS)
    })

    it('forward server with connections', async () => {
        connections.set(PeerID.fromString('test').toNodeId(), createMockDhtNodeRpcRemote(peerDescriptor2))
        const ack = await rpcCommunicator.callRpcMethod('forwardMessage', routedMessage) as RouteMessageAck
        expect(ack.error).toBeUndefined()
    })

    it('forward server on duplicate message', async () => {
        router.addToDuplicateDetector(routedMessage.requestId)
        const ack = await rpcCommunicator.callRpcMethod('forwardMessage', routedMessage) as RouteMessageAck
        expect(ack.error).toEqual(RouteMessageError.DUPLICATE)
    })
})
