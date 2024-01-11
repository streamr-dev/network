import { DhtAddress, PeerDescriptor } from '@streamr/dht'

export interface Layer1NodeEvents {
    newContact: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    newRandomContact: (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => void
}

export interface Layer1Node {
    on<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: PeerDescriptor[]) => void): void
    once<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: PeerDescriptor[]) => void): void
    off<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: PeerDescriptor[]) => void): void
    removeContact: (nodeId: DhtAddress) => void
    getClosestContacts: (maxCount?: number) => PeerDescriptor[]
    getNeighbors: () => PeerDescriptor[]
    getNumberOfNeighbors(): number
    joinDht: (entryPoints: PeerDescriptor[], doRandomJoin?: boolean, retry?: boolean) => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
}
