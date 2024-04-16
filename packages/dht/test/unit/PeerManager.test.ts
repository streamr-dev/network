import { waitForCondition } from '@streamr/utils'
import { range, sample, sampleSize, sortBy, without } from 'lodash'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { PeerManager, getDistance } from '../../src/dht/PeerManager'
import { Contact } from '../../src/dht/contact/Contact'
import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import { DhtAddress, createRandomDhtAddress, getNodeIdFromPeerDescriptor, getRawFromDhtAddress } from '../../src/identifiers'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'
import { createMockPeerDescriptor } from '../utils/utils'

const createPeerManager = (
    nodeIds: DhtAddress[], 
    localPeerDescriptor = createMockPeerDescriptor(),
    pingFailures: Set<DhtAddress> = new Set()
) => {
    const manager = new PeerManager({
        localNodeId: getNodeIdFromPeerDescriptor(localPeerDescriptor),
        localPeerDescriptor: localPeerDescriptor,
        isLayer0: true,
        createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => {
            const remote = new class extends DhtNodeRpcRemote {
                // eslint-disable-next-line class-methods-use-this
                async ping(): Promise<boolean> {
                    return !pingFailures.has(getNodeIdFromPeerDescriptor(peerDescriptor))
                }
            }(localPeerDescriptor, peerDescriptor, undefined as any, new MockRpcCommunicator())
            return remote
        },
        hasConnection: () => false
    } as any)
    const contacts = nodeIds.map((n) => ({ nodeId: getRawFromDhtAddress(n), type: NodeType.NODEJS }))
    for (const contact of contacts) {
        manager.addContact(contact)
    }
    return manager
}

const getClosestContact = (contacts: PeerDescriptor[], referenceId: DhtAddress): PeerDescriptor | undefined => {
    const list = new SortedContactList({
        referenceId,
        allowToContainReferenceId: false
    })
    for (const contact of contacts) {
        list.addContact(new Contact(contact))
    }
    const id = list.getClosestContactId()
    if (id !== undefined) {
        return contacts.find((c) => getNodeIdFromPeerDescriptor(c) === id)
    } else {
        return undefined
    }
}

describe('PeerManager', () => {

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

    it('addContact: ping fails', async () => {
        const localPeerDescriptor = createMockPeerDescriptor()
        const successContacts = range(5).map(() => createMockPeerDescriptor())
        const failureContact = createMockPeerDescriptor()
        const manager = createPeerManager([], localPeerDescriptor, new Set([getNodeIdFromPeerDescriptor(failureContact)]))
        for (const successContact of successContacts) {
            manager.addContact(successContact)
            manager.setContactActive(getNodeIdFromPeerDescriptor(successContact))
            manager.removeNeighbor(getNodeIdFromPeerDescriptor(successContact))
        }
        expect(manager.getNeighborCount()).toBe(0)
        manager.addContact(failureContact)
        const closesSuccessContact = getClosestContact(successContacts, getNodeIdFromPeerDescriptor(localPeerDescriptor))!
        await waitForCondition(() => {
            const neighborNodeIds = manager.getNeighbors().map((n) => getNodeIdFromPeerDescriptor(n))
            return neighborNodeIds.includes(getNodeIdFromPeerDescriptor(closesSuccessContact))
        })
        expect(manager.getNeighbors()).toEqual([closesSuccessContact])
    })

    it('pingAllNeighbors returns all offline nodes', async () => {
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
        failureSet.add(getNodeIdFromPeerDescriptor(failureContact))
        const failedPings = await manager.pingAllNeighbors()
        expect(failedPings).toEqual([failureContact])
    })

    it('pingAllRingContacts returns all offline nodes', async () => {
        const localPeerDescriptor = createMockPeerDescriptor()
        const failureContact = createMockPeerDescriptor()
        const failureSet: Set<DhtAddress> = new Set()
        const manager = createPeerManager([], localPeerDescriptor, failureSet)
        manager.addContact(failureContact)
        // Failure contacts is in the left and right side of the ring
        expect(manager.getRingContacts().getAllContacts().length).toEqual(2)
        failureSet.add(getNodeIdFromPeerDescriptor(failureContact))
        const failedPings = await manager.pingAllRingContacts()
        expect(failedPings).toEqual([failureContact, failureContact])
    })

})
