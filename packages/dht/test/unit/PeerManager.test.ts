import { until } from '@streamr/utils'
import { range, sample, sampleSize } from 'lodash'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { PeerManager } from '../../src/dht/PeerManager'
import { getClosestNodes } from '../../src/dht/contact/getClosestNodes'
import { DhtAddress, randomDhtAddress, toNodeId, toDhtAddressRaw } from '../../src/identifiers'
import { NodeType, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'
import { createMockPeerDescriptor } from '../utils/utils'

const createDhtNodeRpcRemote = (
    peerDescriptor: PeerDescriptor,
    localPeerDescriptor: PeerDescriptor,
    pingFailures: Set<DhtAddress>
) => {
    const remote = new (class extends DhtNodeRpcRemote {
        // eslint-disable-next-line class-methods-use-this
        async ping(): Promise<boolean> {
            return !pingFailures.has(toNodeId(peerDescriptor))
        }
    })(localPeerDescriptor, peerDescriptor, undefined as any, new MockRpcCommunicator())
    return remote
}

const createPeerManager = (
    nodeIds: DhtAddress[],
    localPeerDescriptor = createMockPeerDescriptor(),
    pingFailures: Set<DhtAddress> = new Set()
) => {
    const manager = new PeerManager({
        localNodeId: toNodeId(localPeerDescriptor),
        localPeerDescriptor: localPeerDescriptor,
        isLayer0: true,
        createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) =>
            createDhtNodeRpcRemote(peerDescriptor, localPeerDescriptor, pingFailures),
        hasConnection: () => false
    } as any)
    const contacts = nodeIds.map((n) => ({ nodeId: toDhtAddressRaw(n), type: NodeType.NODEJS }))
    for (const contact of contacts) {
        manager.addContact(contact)
    }
    return manager
}

describe('PeerManager', () => {
    it('getNearbyContactCount', () => {
        const nodeIds = range(10).map(() => randomDhtAddress())
        const manager = createPeerManager(nodeIds)
        expect(manager.getNearbyContactCount()).toBe(10)
        expect(manager.getNearbyContactCount(new Set(sampleSize(nodeIds, 2)))).toBe(8)
        expect(manager.getNearbyContactCount(new Set([sample(nodeIds)!, randomDhtAddress()]))).toBe(9)
    })

    it('addContact: ping fails', async () => {
        const localPeerDescriptor = createMockPeerDescriptor()
        const successContacts = range(5).map(() => createMockPeerDescriptor())
        const failureContact = createMockPeerDescriptor()
        const manager = createPeerManager([], localPeerDescriptor, new Set([toNodeId(failureContact)]))
        for (const successContact of successContacts) {
            manager.addContact(successContact)
            manager.setContactActive(toNodeId(successContact))
            manager.removeNeighbor(toNodeId(successContact))
        }
        expect(manager.getNeighborCount()).toBe(0)
        manager.addContact(failureContact)
        const closesSuccessContact = getClosestNodes(toNodeId(localPeerDescriptor), successContacts)[0]
        await until(() => {
            const neighborNodeIds = manager.getNeighbors().map((n) => n.getNodeId())
            return neighborNodeIds.includes(toNodeId(closesSuccessContact))
        })
        expect(manager.getNeighborCount()).toBe(1)
        expect(manager.getNeighbors()[0].getPeerDescriptor()).toEqualPeerDescriptor(closesSuccessContact)
    })

    it('pruneOfflineNodes removes offline nodes', async () => {
        const localPeerDescriptor = createMockPeerDescriptor()
        const successContacts = range(5).map(() => createMockPeerDescriptor())
        const failureContact = createMockPeerDescriptor()
        const failureSet: Set<DhtAddress> = new Set()
        const manager = createPeerManager([], localPeerDescriptor, failureSet)
        for (const successContact of successContacts) {
            manager.addContact(successContact)
        }
        manager.addContact(failureContact)
        expect(manager.getNeighborCount()).toBe(6)
        failureSet.add(toNodeId(failureContact))
        await manager.pruneOfflineNodes(
            manager
                .getNeighbors()
                .map((node) => createDhtNodeRpcRemote(node.getPeerDescriptor(), localPeerDescriptor, failureSet))
        )
        expect(manager.getNeighborCount()).toBe(5)
    })
})
