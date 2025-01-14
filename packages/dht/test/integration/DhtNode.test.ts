import { until } from '@streamr/utils'
import { range, without } from 'lodash'
import { DhtNodeRpcLocal } from '../../src/dht/DhtNodeRpcLocal'
import { DhtNode, ListeningRpcCommunicator, toNodeId } from '../../src/exports'
import {
    ClosestPeersRequest,
    ClosestPeersResponse,
    PeerDescriptor,
    PingRequest,
    PingResponse
} from '../../generated/packages/dht/protos/DhtRpc'
import { FakeEnvironment } from '../utils/FakeTransport'
import { createMockPeerDescriptor } from '../utils/utils'

const OTHER_NODE_COUNT = 3
const SERVICE_ID_LAYER0 = 'layer0'

describe('DhtNode', () => {
    let localPeerDescriptor: PeerDescriptor
    let entryPointPeerDescriptor: PeerDescriptor
    let otherPeerDescriptors: PeerDescriptor[]

    const startRemoteNode = (peerDescriptor: PeerDescriptor, environment: FakeEnvironment) => {
        const epRpcCommunicator = new ListeningRpcCommunicator(
            SERVICE_ID_LAYER0,
            environment.createTransport(peerDescriptor)
        )
        const dhtNodeRpcLocal = new DhtNodeRpcLocal({
            peerDiscoveryQueryBatchSize: undefined as any,
            getNeighbors: () => without(getAllPeerDescriptors(), peerDescriptor),
            getClosestRingContactsTo: undefined as any,
            addContact: () => {},
            removeContact: undefined as any
        })
        epRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping', (req: PingRequest, context) =>
            dhtNodeRpcLocal.ping(req, context)
        )
        epRpcCommunicator.registerRpcMethod(
            ClosestPeersRequest,
            ClosestPeersResponse,
            'getClosestPeers',
            (req: ClosestPeersRequest, context) => dhtNodeRpcLocal.getClosestPeers(req, context)
        )
    }

    const getAllPeerDescriptors = () => {
        return [localPeerDescriptor, entryPointPeerDescriptor, ...otherPeerDescriptors]
    }

    beforeAll(() => {
        localPeerDescriptor = createMockPeerDescriptor()
        entryPointPeerDescriptor = createMockPeerDescriptor()
        otherPeerDescriptors = range(OTHER_NODE_COUNT).map(() => createMockPeerDescriptor())
    })

    it('start node and join DHT', async () => {
        const environment = new FakeEnvironment()
        startRemoteNode(entryPointPeerDescriptor, environment)
        for (const other of otherPeerDescriptors) {
            startRemoteNode(other, environment)
        }

        const transport = environment.createTransport(localPeerDescriptor)
        const localNode = new DhtNode({
            peerDescriptor: localPeerDescriptor,
            transport,
            connectionsView: transport,
            entryPoints: [entryPointPeerDescriptor]
        })
        await localNode.start()
        await localNode.joinDht([entryPointPeerDescriptor])
        await localNode.waitForNetworkConnectivity()

        await until(() => localNode.getNeighborCount() === otherPeerDescriptors.length + 1)
        const expectedNodeIds = without(getAllPeerDescriptors(), localPeerDescriptor).map((n) => toNodeId(n))
        const actualNodeIds = localNode.getClosestContacts().map((n) => toNodeId(n))
        expect(actualNodeIds).toIncludeSameMembers(expectedNodeIds)
    })
})
