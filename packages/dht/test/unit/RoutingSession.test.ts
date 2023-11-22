import { v4 } from 'uuid'
import { RoutingSession } from '../../src/dht/routing/RoutingSession'
import { Message, MessageType, NodeType, PeerDescriptor, RouteMessageWrapper } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createWrappedClosestPeersRequest } from '../utils/utils'
import { hexToBinary } from '@streamr/utils'
import { PeerIDKey } from '../../src/helpers/PeerID'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { RoutingRpcCommunicator } from '../../src/transport/RoutingRpcCommunicator'
import { keyFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'

describe('RoutingSession', () => {

    let session: RoutingSession
    let connections: Map<PeerIDKey, DhtNodeRpcRemote>
    let rpcCommunicator: RoutingRpcCommunicator

    const mockPeerDescriptor1: PeerDescriptor = {
        kademliaId: hexToBinary('eee1'),
        type: NodeType.NODEJS
    }

    const mockPeerDescriptor2 = {
        kademliaId: hexToBinary('eee2'),
        type: NodeType.NODEJS
    }

    const rpcWrapper = createWrappedClosestPeersRequest(mockPeerDescriptor1)
    const message: Message = {
        serviceId: 'unknown',
        messageId: v4(),
        messageType: MessageType.RPC,
        body: {
            oneofKind: 'rpcMessage',
            rpcMessage: rpcWrapper
        },
        sourceDescriptor: mockPeerDescriptor1,
        targetDescriptor: mockPeerDescriptor2
    }
    const routedMessage: RouteMessageWrapper = {
        message,
        requestId: 'REQ',
        routingPath: [],
        reachableThrough: [],
        destinationPeer: mockPeerDescriptor1,
        sourcePeer: mockPeerDescriptor2
    }

    const createMockDhtNodeRpcRemote = (destination: PeerDescriptor): DhtNodeRpcRemote => {
        return new DhtNodeRpcRemote(mockPeerDescriptor1, destination, {} as any, 'router')
    }

    beforeEach(() => {
        rpcCommunicator = new RoutingRpcCommunicator('mock', async () => {})
        connections = new Map()
        session = new RoutingSession(rpcCommunicator, mockPeerDescriptor1, routedMessage, connections, 2)
    })

    afterEach(() => {
        rpcCommunicator.stop()
        session.stop()
    })

    it('findMoreContacts', () => {
        connections.set(keyFromPeerDescriptor(mockPeerDescriptor2), createMockDhtNodeRpcRemote(mockPeerDescriptor2))
        const contacts = session.getRoutablePeers()
        expect(contacts.length).toBe(1)
    })

    it('findMoreContacts peer disconnects', () => {
        connections.set(keyFromPeerDescriptor(mockPeerDescriptor2), createMockDhtNodeRpcRemote(mockPeerDescriptor2))
        expect(session.getRoutablePeers().length).toBe(1)
        connections.delete(keyFromPeerDescriptor(mockPeerDescriptor2))
        expect(session.getRoutablePeers().length).toBe(0)
    })

})
