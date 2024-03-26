import { PeerManager, getDistance } from '../../src/dht/PeerManager'
import { DhtAddress, createRandomDhtAddress, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../../src/identifiers'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { range, sample, sampleSize, sortBy, without } from 'lodash'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'
import { createMockPeerDescriptor } from '../utils/utils'

const createPeerManager = (nodeIds: DhtAddress[]) => {
    const peerDescriptor = createMockPeerDescriptor()
    const manager = new PeerManager({
        localNodeId: getNodeIdFromPeerDescriptor(peerDescriptor),
        localPeerDescriptor: peerDescriptor,
        createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => {
            return new DhtNodeRpcRemote(undefined as any, peerDescriptor, undefined as any, new MockRpcCommunicator())
        }
    } as any)
    const contacts = nodeIds.map((n) => ({ nodeId: getRawFromDhtAddress(n), type: NodeType.NODEJS }))
    for (const contact of contacts) {
        manager.addContact(contact)
    }
    return manager
}

describe('PeerManager', () => {

    it('getClosestContactsTo', () => {
        const nodeIds = range(10).map(() => createRandomDhtAddress())
        const manager = createPeerManager(nodeIds)
        const referenceId = createRandomDhtAddress()
        const excluded = new Set<DhtAddress>(sampleSize(nodeIds, 2))

        const actual = manager.getClosestContactsTo(referenceId, 5, excluded)

        const expected = sortBy(
            without(nodeIds, ...Array.from(excluded.values())),
            (n: DhtAddress) => getDistance(getRawFromDhtAddress(n), getRawFromDhtAddress(referenceId))
        ).slice(0, 5)
        expect(actual.map((n) => n.getNodeId())).toEqual(expected)
    })

    it('getClosestNeighborsTo', () => {
        const nodeIds = range(10).map(() => createRandomDhtAddress())
        const manager = createPeerManager(nodeIds)
        const referenceId = createRandomDhtAddress()
        const excluded = new Set<DhtAddress>(sampleSize(nodeIds, 2))

        const actual = manager.getClosestNeighborsTo(referenceId, 5, excluded)

        const expected = sortBy(
            without(manager.getNeighbors().map((n) => getNodeIdFromPeerDescriptor(n)), ...Array.from(excluded.values())),
            (n: DhtAddress) => getDistance(getRawFromDhtAddress(n), getRawFromDhtAddress(referenceId))
        ).slice(0, 5)
        expect(actual.map((n) => n.getNodeId())).toEqual(expected)
    })

    it('getContactCount', () => {
        const nodeIds = range(10).map(() => createRandomDhtAddress())
        const manager = createPeerManager(nodeIds)
        expect(manager.getContactCount()).toBe(10)
        expect(manager.getContactCount(new Set(sampleSize(nodeIds, 2)))).toBe(8)
        expect(manager.getContactCount(new Set([sample(nodeIds)!, createRandomDhtAddress()]))).toBe(9)
    })
})
