import { waitForCondition } from '@streamr/utils'
import { range, without } from 'lodash'
import { DhtNodeRpcLocal } from '../../src/dht/DhtNodeRpcLocal'
import { Contact } from '../../src/dht/contact/Contact'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { DhtAddress, DhtNode, ListeningRpcCommunicator, getNodeIdFromPeerDescriptor } from '../../src/exports'
import { ClosestPeersRequest, ClosestPeersResponse, PeerDescriptor, PingRequest, PingResponse } from '../../src/proto/packages/dht/protos/DhtRpc'
import { FakeEnvironment } from '../utils/FakeTransport'
import { createMockPeerDescriptor } from '../utils/utils'

const OTHER_NODE_COUNT = 3
const SERVICE_ID_LAYER0 = 'layer0'

const getClosestNodes = (
    referenceId: DhtAddress,
    nodes: PeerDescriptor[],
    maxCount: number,
    allowToContainReferenceId: boolean
): PeerDescriptor[] => {
    const list = new SortedContactList<Contact>({
        referenceId,
        allowToContainReferenceId,
        maxSize: maxCount
    })
    list.addContacts(nodes.map((n) => new Contact(n)))
    return list.getClosestContacts().map((c) => c.getPeerDescriptor())
}

describe('DhtNode', () => {

    let localPeerDescriptor: PeerDescriptor
    let entryPointPeerDescriptor: PeerDescriptor
    let otherPeerDescriptors: PeerDescriptor[]

    const startRemoteNode = (peerDescriptor: PeerDescriptor, environment: FakeEnvironment) => {
        const epRpcCommunicator = new ListeningRpcCommunicator(SERVICE_ID_LAYER0, environment.createTransport(peerDescriptor))
        const dhtNodeRpcLocal = new DhtNodeRpcLocal({
            peerDiscoveryQueryBatchSize: undefined as any,
            getClosestNeighborsTo: (nodeId: DhtAddress, maxCount: number) => getClosestNodes(nodeId, getAllPeerDescriptors(), maxCount, true),
            getClosestRingContactsTo: undefined as any,
            addContact: () => {},
            removeContact: undefined as any,
        })
        epRpcCommunicator.registerRpcMethod(PingRequest, PingResponse, 'ping',
            (req: PingRequest, context) => dhtNodeRpcLocal.ping(req, context))
        epRpcCommunicator.registerRpcMethod(ClosestPeersRequest, ClosestPeersResponse, 'getClosestPeers',
            (req: ClosestPeersRequest, context) => dhtNodeRpcLocal.getClosestPeers(req, context))
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

        const localNode = new DhtNode({
            peerDescriptor: localPeerDescriptor,
            transport: environment.createTransport(localPeerDescriptor),
            entryPoints: [entryPointPeerDescriptor]
        })
        await localNode.start()
        await localNode.joinDht([entryPointPeerDescriptor])
        await localNode.waitForNetworkConnectivity()

        await waitForCondition(() => localNode.getNeighborCount() === otherPeerDescriptors.length + 1)
        const expectedNodeIds = without(getAllPeerDescriptors(), localPeerDescriptor).map((n) => getNodeIdFromPeerDescriptor(n))
        const actualNodeIds = localNode.getClosestContacts().map((n) => getNodeIdFromPeerDescriptor(n))
        expect(actualNodeIds).toIncludeSameMembers(expectedNodeIds)
    })
})
