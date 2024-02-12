import { DhtAddress, PeerDescriptor } from '@streamr/dht'

export interface Layer1NodeEvents {
    contactAdded: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    contactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: PeerDescriptor[]) => void
    randomContactAdded: (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor, randomPeers: PeerDescriptor[]) => void
    ringContactAdded: (peerDescriptor: PeerDescriptor, closestPeers: { left: PeerDescriptor[], right: PeerDescriptor[] }) => void
    ringContactRemoved: (peerDescriptor: PeerDescriptor, closestPeers: { left: PeerDescriptor[], right: PeerDescriptor[] }) => void
}

export interface Layer1Node {
    on<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: PeerDescriptor[]) => void): void
    once<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: PeerDescriptor[]) => void): void
    off<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: PeerDescriptor[]) => void): void
    on<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: { left: PeerDescriptor[], right: PeerDescriptor[] }) => void): void
    once<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: { left: PeerDescriptor[], right: PeerDescriptor[] }) => void): void
    off<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor, peers: { left: PeerDescriptor[], right: PeerDescriptor[] }) => void): void
    removeContact: (nodeId: DhtAddress) => void
    getClosestContacts: (maxCount?: number) => PeerDescriptor[]
    getNeighbors: () => PeerDescriptor[]
    getNeighborCount(): number
    joinDht: (entryPoints: PeerDescriptor[], doRandomJoin?: boolean, retry?: boolean) => Promise<void>
    joinRing: () => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
}
