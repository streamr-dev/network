import { PeerDescriptor, RingContacts } from '@streamr/dht'
import { EventEmitter } from 'eventemitter3'
import { DiscoveryLayerNode, DiscoveryLayerNodeEvents } from '../../../src/logic/DiscoveryLayerNode'
import { createMockPeerDescriptor } from '../utils'

export class MockDiscoveryLayerNode extends EventEmitter<DiscoveryLayerNodeEvents> implements DiscoveryLayerNode {
    private readonly kbucketPeers: PeerDescriptor[] = []
    private closestContacts: PeerDescriptor[] = []
    private randomContacts: PeerDescriptor[] = []

    // eslint-disable-next-line class-methods-use-this
    removeContact(): void {}

    getClosestContacts(): PeerDescriptor[] {
        return this.closestContacts
    }

    setClosestContacts(contacts: PeerDescriptor[]): void {
        this.closestContacts = contacts
    }

    getRandomContacts(): PeerDescriptor[] {
        return this.randomContacts
    }

    setRandomContacts(contacts: PeerDescriptor[]): void {
        this.randomContacts = contacts
    }

    // eslint-disable-next-line class-methods-use-this
    getRingContacts(): RingContacts {
        return { left: [], right: [] }
    }

    getNeighbors(): PeerDescriptor[] {
        return this.kbucketPeers
    }

    getNeighborCount(): number {
        return this.kbucketPeers.length
    }

    addNewRandomPeerToKBucket(): void {
        this.kbucketPeers.push(createMockPeerDescriptor())
    }

    // eslint-disable-next-line class-methods-use-this
    async joinDht(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async joinRing(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {}
}
