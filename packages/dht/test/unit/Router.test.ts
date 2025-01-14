import { v4 } from 'uuid'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { Router } from '../../src/dht/routing/Router'
import {
    Message,
    PeerDescriptor,
    RouteMessageAck,
    RouteMessageError,
    RouteMessageWrapper
} from '../../generated/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor, createWrappedClosestPeersRequest } from '../utils/utils'
import { FakeRpcCommunicator } from '../utils/FakeRpcCommunicator'
import { DhtAddress, toNodeId, randomDhtAddress } from '../../src/identifiers'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'

describe('Router', () => {
    let router: Router
    const peerDescriptor1 = createMockPeerDescriptor()
    const peerDescriptor2 = createMockPeerDescriptor()
    const rpcWrapper = createWrappedClosestPeersRequest(peerDescriptor1)
    const message: Message = {
        serviceId: 'unknown',
        messageId: v4(),
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
        target: peerDescriptor1.nodeId,
        sourcePeer: peerDescriptor2,
        parallelRootNodeIds: []
    }
    let connections: Map<DhtAddress, DhtNodeRpcRemote>
    const rpcCommunicator = new FakeRpcCommunicator()

    const createMockDhtNodeRpcRemote = (destination: PeerDescriptor): DhtNodeRpcRemote => {
        return new DhtNodeRpcRemote(peerDescriptor1, destination, undefined as any, new MockRpcCommunicator())
    }

    beforeEach(() => {
        connections = new Map()
        router = new Router({
            localPeerDescriptor: peerDescriptor1,
            rpcCommunicator: rpcCommunicator as any,
            handleMessage: () => {},
            getConnections: () => [...connections.values()].map((c) => c.getPeerDescriptor())
        })
    })

    afterEach(() => {
        router.stop()
    })

    it('doRouteMessage without connections', async () => {
        const ack = (await rpcCommunicator.callRpcMethod('routeMessage', {
            message,
            target: peerDescriptor2.nodeId,
            requestId: v4(),
            sourcePeer: peerDescriptor1,
            reachableThrough: [],
            routingPath: [],
            parallelRootNodeIds: []
        })) as RouteMessageAck
        expect(ack.error).toEqual(RouteMessageError.NO_TARGETS)
    })

    it('doRouteMessage with connections', async () => {
        connections.set(randomDhtAddress(), createMockDhtNodeRpcRemote(peerDescriptor2))
        const ack = (await rpcCommunicator.callRpcMethod('routeMessage', {
            message,
            target: peerDescriptor2.nodeId,
            requestId: v4(),
            sourcePeer: peerDescriptor1,
            reachableThrough: [],
            routingPath: [],
            parallelRootNodeIds: []
        })) as RouteMessageAck
        expect(ack.error).toBeUndefined()
    })

    it('doRouteMessage with parallelRootNodeIds', async () => {
        const nodeId = toNodeId(peerDescriptor2)
        connections.set(nodeId, createMockDhtNodeRpcRemote(peerDescriptor2))
        const ack = (await rpcCommunicator.callRpcMethod('routeMessage', {
            message,
            target: peerDescriptor2.nodeId,
            requestId: v4(),
            sourcePeer: peerDescriptor1,
            reachableThrough: [],
            routingPath: [],
            parallelRootNodeIds: [nodeId]
        })) as RouteMessageAck
        expect(ack.error).toEqual(RouteMessageError.NO_TARGETS)
    })

    it('route server is destination without connections', async () => {
        const ack = (await rpcCommunicator.callRpcMethod('routeMessage', routedMessage)) as RouteMessageAck
        expect(ack.error).toBeUndefined()
    })

    it('route server with connections', async () => {
        connections.set(randomDhtAddress(), createMockDhtNodeRpcRemote(peerDescriptor2))
        const ack = (await rpcCommunicator.callRpcMethod('routeMessage', routedMessage)) as RouteMessageAck
        expect(ack.error).toBeUndefined()
    })

    it('route server on duplicate message', async () => {
        router.addToDuplicateDetector(routedMessage.requestId)
        const ack = (await rpcCommunicator.callRpcMethod('routeMessage', routedMessage)) as RouteMessageAck
        expect(ack.error).toEqual(RouteMessageError.DUPLICATE)
    })

    it('forward server no connections', async () => {
        const ack = (await rpcCommunicator.callRpcMethod('forwardMessage', routedMessage)) as RouteMessageAck
        expect(ack.error).toEqual(RouteMessageError.NO_TARGETS)
    })

    it('forward server with connections', async () => {
        connections.set(randomDhtAddress(), createMockDhtNodeRpcRemote(peerDescriptor2))
        const ack = (await rpcCommunicator.callRpcMethod('forwardMessage', routedMessage)) as RouteMessageAck
        expect(ack.error).toBeUndefined()
    })

    it('forward server on duplicate message', async () => {
        router.addToDuplicateDetector(routedMessage.requestId)
        const ack = (await rpcCommunicator.callRpcMethod('forwardMessage', routedMessage)) as RouteMessageAck
        expect(ack.error).toEqual(RouteMessageError.DUPLICATE)
    })
})
