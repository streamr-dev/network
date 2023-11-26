import { areEqualBinaries } from '@streamr/utils'
import KBucket from 'k-bucket'
import { range, sortBy } from 'lodash'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { DiscoverySession } from '../../src/dht/discovery/DiscoverySession'
import { PeerID } from '../../src/exports'
import { createRandomKademliaId } from '../../src/helpers/kademliaId'
import { peerIdFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'

const REMOTE_NODE_COUNT = 5

const createMockPeerDescriptor = (kademliaId: Uint8Array): PeerDescriptor => {
    return {
        kademliaId,
        type: NodeType.NODEJS
    }
}

describe('DiscoverySession', () => {

    const localPeerDescriptor = createMockPeerDescriptor(createRandomKademliaId())
    const remotePeerDescriptors = range(REMOTE_NODE_COUNT).map(() => createMockPeerDescriptor(createRandomKademliaId()))

    const getClosestPeerDescriptors = (thisId: Uint8Array) => {
        return sortBy(
            remotePeerDescriptors
                .filter((p) => areEqualBinaries(p.kademliaId, thisId))
                .concat([localPeerDescriptor]),
            (p: PeerDescriptor) => KBucket.distance(p.kademliaId, thisId)
        )
    }

    const createMockRpcRemote = (kademliaId: Uint8Array): Partial<DhtNodeRpcRemote> => {
        return { 
            getPeerDescriptor: () => createMockPeerDescriptor(kademliaId),
            getPeerId: () => PeerID.fromValue(kademliaId),
            getClosestPeers: async () => {
                // in this test implementation all nodes are connected to all other nodes
                return getClosestPeerDescriptors(kademliaId)
            }
        }
    }

    it('happy path', async () => {
        const newContactListener = jest.fn()
        const targetId = createRandomKademliaId()
        const neighborList = new SortedContactList<DhtNodeRpcRemote>(peerIdFromPeerDescriptor(localPeerDescriptor), 100)
        // TODO would be ok if we'd start by only with one random remote in the neighborList?
        remotePeerDescriptors.forEach((p) => neighborList.addContact(createMockRpcRemote(p.kademliaId) as any))
        const session = new DiscoverySession({
            newContactListener,
            targetId,
            neighborList: neighborList as any,
            localPeerDescriptor,
            parallelism: 1,
            bucket: undefined as any,
            noProgressLimit: 100,
            createRpcRemote: (peerDescriptor: PeerDescriptor) => createMockRpcRemote(peerDescriptor.kademliaId) as any
        })
        await session.findClosestNodes(1000)
        expect(newContactListener).toHaveBeenCalledTimes(REMOTE_NODE_COUNT)
        // TODO can we assert somethinng about the order of newContactListener calls? (i.e. that the globally closest node
        // is the first item and so on)
        session.stop()
    })
})
