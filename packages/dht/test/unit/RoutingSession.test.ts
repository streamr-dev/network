import { v4 } from 'uuid'
import { RoutingMode, RoutingSession } from '../../src/dht/routing/RoutingSession'
import { Message, PeerDescriptor, RouteMessageWrapper } from '../../generated/packages/dht/protos/DhtRpc'
import { createMockPeerDescriptor, createWrappedClosestPeersRequest } from '../utils/utils'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { RoutingRpcCommunicator } from '../../src/transport/RoutingRpcCommunicator'
import { DhtAddress, toNodeId } from '../../src/identifiers'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'
import { RoutingTablesCache } from '../../src/dht/routing/RoutingTablesCache'

describe('RoutingSession', () => {

    let session: RoutingSession
    let connections: Map<DhtAddress, DhtNodeRpcRemote>
    let rpcCommunicator: RoutingRpcCommunicator
    let routingTablesCache: RoutingTablesCache
    const mockPeerDescriptor1 = createMockPeerDescriptor()
    const mockPeerDescriptor2 = createMockPeerDescriptor()
    const rpcWrapper = createWrappedClosestPeersRequest(mockPeerDescriptor1)
    const message: Message = {
        serviceId: 'unknown',
        messageId: v4(),
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
        target: mockPeerDescriptor1.nodeId,
        sourcePeer: mockPeerDescriptor2,
        parallelRootNodeIds: []
    }

    const createMockDhtNodeRpcRemote = (destination: PeerDescriptor): DhtNodeRpcRemote => {
        return new DhtNodeRpcRemote(mockPeerDescriptor1, destination, undefined as any, rpcCommunicator)
    }

    beforeEach(() => {
        rpcCommunicator = new MockRpcCommunicator()
        connections = new Map()
        routingTablesCache = new RoutingTablesCache()
        session = new RoutingSession({
            rpcCommunicator: rpcCommunicator,
            localPeerDescriptor: mockPeerDescriptor1,
            routedMessage,
            parallelism: 2,
            mode: RoutingMode.ROUTE,
            excludedNodeIds: new Set(),
            routingTablesCache,
            getConnections: () => [...connections.values()].map((c) => c.getPeerDescriptor())
        })
    })

    afterEach(() => {
        rpcCommunicator.stop()
        session.stop()
    })

    it('findMoreContacts', () => {
        connections.set(toNodeId(mockPeerDescriptor2), createMockDhtNodeRpcRemote(mockPeerDescriptor2))
        const contacts = session.updateAndGetRoutablePeers()
        expect(contacts.length).toBe(1)
    })

    it('findMoreContacts peer disconnects', () => {
        connections.set(toNodeId(mockPeerDescriptor2), createMockDhtNodeRpcRemote(mockPeerDescriptor2))
        expect(session.updateAndGetRoutablePeers().length).toBe(1)
        connections.delete(toNodeId(mockPeerDescriptor2))
        routingTablesCache.onNodeDisconnected(toNodeId(mockPeerDescriptor2))
        expect(session.updateAndGetRoutablePeers().length).toBe(0)
    })

    it('recalculates Routing Table if it is empty', () => {
        connections.set(toNodeId(mockPeerDescriptor2), createMockDhtNodeRpcRemote(mockPeerDescriptor2))
        expect(session.updateAndGetRoutablePeers().length).toBe(1)
        routingTablesCache.onNodeDisconnected(toNodeId(mockPeerDescriptor2))
        expect(session.updateAndGetRoutablePeers().length).toBe(1)
    })

})
