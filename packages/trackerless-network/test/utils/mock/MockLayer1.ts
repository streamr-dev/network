import { EventEmitter } from 'eventemitter3'
import { ILayer1 } from '../../../src/logic/ILayer1'
import { DhtPeer, PeerDescriptor, PeerID, PeerIDKey, SortedContactList, NodeType } from '@streamr/dht'
import { NodeID } from '../../../src/identifiers'
import { hexToBinary } from '@streamr/utils'
import { createRandomNodeId } from '../utils'

export class MockLayer1 extends EventEmitter implements ILayer1 {
    
    private readonly kbucketPeers: PeerDescriptor[] = []
    private readonly neighborList: SortedContactList<DhtPeer>

    constructor(nodeId: NodeID) {
        super()
        this.neighborList = new SortedContactList(PeerID.fromKey(nodeId as string as PeerIDKey), 10)
    }

    // eslint-disable-next-line class-methods-use-this
    removeContact(_peerDescriptor: PeerDescriptor, _removeFromOpenInternetPeers?: boolean): void {

    }

    getNeighborList(): SortedContactList<DhtPeer> {
        return this.neighborList
    }

    getKBucketPeers(): PeerDescriptor[] {
        return this.kbucketPeers
    }

    getBucketSize(): number {
        return this.kbucketPeers.length
    }

    addNewRandomPeerToKBucket(): void {
        this.kbucketPeers.push({
            kademliaId: hexToBinary(createRandomNodeId()),
            type: NodeType.NODEJS
        })
    }

    // eslint-disable-next-line class-methods-use-this
    async joinDht(_entryPoints: PeerDescriptor[], _doRandomJoin?: boolean): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {}    
}
