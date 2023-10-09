import { PeerDescriptor, SortedContactList, DhtPeer } from '@streamr/dht'

export interface ILayer1Events {
    newContact: (contact: DhtPeer, closestContacts: DhtPeer[]) => void
    contactRemoved: (contact: DhtPeer, closestContacts: DhtPeer[]) => void
    newRandomContact: (contact: DhtPeer, randomContacts: DhtPeer[]) => void
    randomContactRemoved: (contact: DhtPeer, randomContacts: DhtPeer[]) => void
}

export interface ILayer1 {
    on<T extends keyof ILayer1Events>(eventName: T, listener: (contact: DhtPeer, contacts: DhtPeer[]) => void): void

    once<T extends keyof ILayer1Events>(eventName: T, listener: (contact: DhtPeer, contacts: DhtPeer[]) => void): void

    off<T extends keyof ILayer1Events>(eventName: T, listener: (contact: DhtPeer, contacts: DhtPeer[]) => void): void
    
    removeContact: (peerDescriptor: PeerDescriptor, removeFromOpenInternetPeers?: boolean) => void
    getNeighborList: () => SortedContactList<DhtPeer>
    getKBucketPeers: () => PeerDescriptor[]
    getBucketSize: () => number
    joinDht: (entryPoints: PeerDescriptor[], doRandomJoin?: boolean, retry?: boolean) => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
}
