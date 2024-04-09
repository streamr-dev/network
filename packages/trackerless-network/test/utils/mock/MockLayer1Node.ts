import { PeerDescriptor, RingContacts } from '@streamr/dht'
import { EventEmitter } from 'eventemitter3'
import { Layer1Node } from '../../../src/logic/Layer1Node'
import { createMockPeerDescriptor } from '../utils'

export class MockLayer1Node extends EventEmitter implements Layer1Node {

    private readonly kbucketPeers: PeerDescriptor[] = []

    // eslint-disable-next-line class-methods-use-this
    removeContact(): void {
    }

    // eslint-disable-next-line class-methods-use-this
    getClosestContacts(): PeerDescriptor[] {
        return []
    }

    // eslint-disable-next-line class-methods-use-this
    getRandomContacts(): PeerDescriptor[] {
        return []
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
