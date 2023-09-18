import { PeerDescriptor, SortedContactList, DhtPeer } from '@streamr/dht'
import EventEmitter from 'eventemitter3'

export interface ILayer1Events {
    newContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    newRandomContact: (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => void
}

export interface ILayer1 extends EventEmitter<ILayer1Events> {
    removeContact: (peerDescriptor: PeerDescriptor, removeFromOpenInternetPeers?: boolean) => void
    getNeighborList: () => SortedContactList<DhtPeer>
    getKBucketPeers: () => PeerDescriptor[]
    getBucketSize: () => number
    joinDht: (entryPoints: PeerDescriptor[], doRandomJoin?: boolean) => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
}
