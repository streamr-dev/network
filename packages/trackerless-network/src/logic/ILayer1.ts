import { PeerDescriptor } from '@streamr/dht'

export interface ILayer1Events {
    newContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    newRandomContact: (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => void
}

export interface ILayer1 {
    on<T extends keyof ILayer1Events>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: PeerDescriptor[]) => void): void

    once<T extends keyof ILayer1Events>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: PeerDescriptor[]) => void): void

    off<T extends keyof ILayer1Events>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: PeerDescriptor[]) => void): void
    
    removeContact: (peerDescriptor: PeerDescriptor, removeFromOpenInternetPeers?: boolean) => void
    getClosestContacts: (maxCount?: number) => PeerDescriptor[]
    getKBucketPeers: () => PeerDescriptor[]
    getBucketSize: () => number
    joinDht: (entryPoints: PeerDescriptor[], doRandomJoin?: boolean, retry?: boolean) => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
}
