import { PeerDescriptor } from '@streamr/dht'
import { EventEmitter } from 'eventemitter3'
import { ILayer1 } from '../../../src/logic/ILayer1'
import { createMockPeerDescriptor } from '../utils'

export class MockLayer1 extends EventEmitter implements ILayer1 {
    
    private readonly kbucketPeers: PeerDescriptor[] = []

    // eslint-disable-next-line class-methods-use-this
    removeContact(): void {
    }

    // eslint-disable-next-line class-methods-use-this
    getClosestContacts(): PeerDescriptor[] {
        return []
    }

    getKBucketPeers(): PeerDescriptor[] {
        return this.kbucketPeers
    }

    getBucketSize(): number {
        return this.kbucketPeers.length
    }

    addNewRandomPeerToKBucket(): void {
        this.kbucketPeers.push(createMockPeerDescriptor())
    }

    // eslint-disable-next-line class-methods-use-this
    async joinDht(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {}    
}
