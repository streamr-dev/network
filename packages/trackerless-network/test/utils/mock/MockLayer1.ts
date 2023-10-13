import { PeerDescriptor } from '@streamr/dht'
import { EventEmitter } from 'eventemitter3'
import { NodeID } from '../../../src/identifiers'
import { ILayer1 } from '../../../src/logic/ILayer1'
import { createMockPeerDescriptor } from '../utils'

export class MockLayer1 extends EventEmitter implements ILayer1 {
    
    private readonly kbucketPeers: PeerDescriptor[] = []

    constructor(_nodeId: NodeID) {
        super()
    }

    // eslint-disable-next-line class-methods-use-this
    removeContact(_peerDescriptor: PeerDescriptor, _removeFromOpenInternetPeers?: boolean): void {
    }

    // eslint-disable-next-line class-methods-use-this
    getClosestContacts(_maxCount?: number): PeerDescriptor[] {
        return []
    }

    getPeers(): PeerDescriptor[] {
        return this.kbucketPeers
    }

    getPeerCount(): number {
        return this.kbucketPeers.length
    }

    addNewRandomPeerToKBucket(): void {
        this.kbucketPeers.push(createMockPeerDescriptor())
    }

    // eslint-disable-next-line class-methods-use-this
    async joinDht(_entryPoints: PeerDescriptor[], _doRandomJoin?: boolean): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {}    
}
