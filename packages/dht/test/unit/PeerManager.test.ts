import { PeerManager, getDistance } from '../../src/dht/PeerManager'
import { DhtAddress, createRandomDhtAddress, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../../src/identifiers'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { range, sampleSize, sortBy, without } from 'lodash'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'
import { createMockPeerDescriptor } from '../utils/utils'

describe('PeerManager', () => {

    it('getClosestContactsTo', () => {
        const nodeIds = range(10).map(() => createRandomDhtAddress())
        const peerDescriptor = createMockPeerDescriptor()
        const manager = new PeerManager({
            localNodeId: getNodeIdFromPeerDescriptor(peerDescriptor),
            localPeerDescriptor: peerDescriptor,
            createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => {
                return new DhtNodeRpcRemote(undefined as any, peerDescriptor, undefined as any, new MockRpcCommunicator())
            }
        } as any)
        manager.addContact(nodeIds.map((n) => ({ nodeId: getRawFromDhtAddress(n), type: NodeType.NODEJS })))

        const referenceId = createRandomDhtAddress()
        const excluded = new Set<DhtAddress>(sampleSize(nodeIds, 2))
        const actual = manager.getClosestContactsTo(referenceId, 5, excluded)

        const expected = sortBy(
            without(nodeIds, ...Array.from(excluded.values())),
            (n: DhtAddress) => getDistance(getRawFromDhtAddress(n), getRawFromDhtAddress(referenceId))
        ).slice(0, 5)
        expect(actual.map((n) => n.getNodeId())).toEqual(expected)
    })
})
