import { Router } from "../../src/dht/routing/Router"
import { Message, MessageType, PeerDescriptor, RouteMessageWrapper } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from '../../src/helpers/PeerID'
import { DhtPeer } from '../../src/dht/DhtPeer'
import { createWrappedClosestPeersRequest, createMockRoutingRpcCommunicator } from '../utils/utils'
import { v4 } from 'uuid'
import { keyFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'

describe('Router', () => {
    let router: Router

    const peerId = PeerID.fromString('router')
    const peerDescriptor1: PeerDescriptor = {
        kademliaId: peerId.value,
        type: 0,
        nodeName: 'router'
    }
    const peerDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString('destination').value,
        type: 0,
    }
    const rpcWrapper = createWrappedClosestPeersRequest(peerDescriptor1, peerDescriptor2)
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
    let connections: Map<PeerIDKey, DhtPeer>
    const mockRpcCommunicator = createMockRoutingRpcCommunicator()

    const createMockDhtPeer = (destination: PeerDescriptor): DhtPeer => {
        return new DhtPeer(peerDescriptor1, destination, {} as any, 'router')
    }

    beforeEach(() => {
        connections = new Map()
        router = new Router({
            ownPeerDescriptor: peerDescriptor1,
            ownPeerId: peerId,
            rpcCommunicator: mockRpcCommunicator,
            addContact: (_contact) => {},
            serviceId: 'router',
            connections,
            routeMessageTimeout: 2000
        })
    })

    afterEach(() => {
        router.stop()
    })

    it('doRouteMessage without connections', () => {
        const ack = router.doRouteMessage({
            message,
            destinationPeer: peerDescriptor2,
            requestId: v4(),
            sourcePeer: peerDescriptor1,
            reachableThrough: [],
            routingPath: []
        })
        expect(ack.error).toEqual('No routing candidates found')
    })

    it('doRouteMessage with connections', () => {
        connections.set(PeerID.fromString('test').toKey(), createMockDhtPeer(peerDescriptor2))
        const ack = router.doRouteMessage({
            message,
            destinationPeer: peerDescriptor2,
            requestId: v4(),
            sourcePeer: peerDescriptor1,
            reachableThrough: [],
            routingPath: []
        })
        expect(ack.error).toEqual('')
    })

    it('route server is destination without connections', async () => {
        const ack = await router.routeMessage(routedMessage, {} as any)
        expect(ack.error).toEqual('')
    })

    it('route server with connections', async () => {
        connections.set(PeerID.fromString('test').toKey(), createMockDhtPeer(peerDescriptor2))
        const ack = await router.routeMessage(routedMessage, {} as any)
        expect(ack.error).toEqual('')
    })

    it('route server on duplicate message', async () => {
        router.addToDuplicateDetector(routedMessage.requestId, keyFromPeerDescriptor(peerDescriptor2))
        const ack = await router.routeMessage(routedMessage, {} as any)
        expect(ack.error).toEqual('message given to routeMessage() service is likely a duplicate')
    })

    it('forward server no connections', async () => {
        const ack = await router.forwardMessage(routedMessage, {} as any)
        expect(ack.error).toEqual('No routing candidates found')
    })

    it('forward server with connections', async () => {
        connections.set(PeerID.fromString('test').toKey(), createMockDhtPeer(peerDescriptor2))
        const ack = await router.forwardMessage(routedMessage, {} as any)
        expect(ack.error).toEqual('')
    })

    it('forward server on duplicate message', async () => {
        router.addToDuplicateDetector(routedMessage.requestId, keyFromPeerDescriptor(peerDescriptor2))
        const ack = await router.forwardMessage(routedMessage, {} as any)
        expect(ack.error).toEqual('message given to forwardMessage() service is likely a duplicate')
    })

})
