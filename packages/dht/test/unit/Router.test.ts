import { Router } from "../../src/dht/routing/Router"
import { Message, MessageType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from '../../src/helpers/PeerID'
import { DhtPeer } from '../../src/dht/DhtPeer'
import { createWrappedClosestPeersRequest } from '../utils'
import { v4 } from 'uuid'
import { RoutingRpcCommunicator } from '../../src/transport/RoutingRpcCommunicator'

describe('Router', () => {
    let router: Router

    const peerId = PeerID.fromString('router')
    const peerDescriptor: PeerDescriptor = {
        kademliaId: peerId.value,
        type: 0,
        nodeName: 'router'
    }
    const mockDestination: PeerDescriptor = {
        kademliaId: PeerID.fromString('destination').value,
        type: 0,
        nodeName: 'router'
    }

    const rpcWrapper = createWrappedClosestPeersRequest(peerDescriptor, mockDestination)
    const message: Message = {
        serviceId: 'unknown',
        messageId: v4(),
        messageType: MessageType.RPC,
        body: {
            oneofKind: 'rpcMessage',
            rpcMessage: rpcWrapper
        },
        sourceDescriptor: peerDescriptor,
        targetDescriptor: mockDestination
    }

    let connections: Map<PeerIDKey, DhtPeer>

    let mockRpcCommunicator = new RoutingRpcCommunicator('router', async (_msg, _doNotConnect) => {})

    beforeEach(() => {
        connections = new Map()
        router = new Router({
            ownPeerDescriptor: peerDescriptor,
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
            destinationPeer: mockDestination,
            requestId: v4(),
            sourcePeer: peerDescriptor,
            reachableThrough: [],
            routingPath: []
        })
        expect(ack.error).toEqual('No routing candidates found')
    })

    it('doRouteMessage with 1 connection', () => {
        connections.
        const ack = router.doRouteMessage({
            message,
            destinationPeer: mockDestination,
            requestId: v4(),
            sourcePeer: peerDescriptor,
            reachableThrough: [],
            routingPath: []
        })
        expect(ack.error).toEqual('No routing candidates found')
    })
})