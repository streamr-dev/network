import { DhtAddress, PeerDescriptor, RingContacts } from '@streamr/dht'

export interface Layer1NodeEvents {
    nearbyContactAdded: (peerDescriptor: PeerDescriptor) => void
    nearbyContactRemoved: (peerDescriptor: PeerDescriptor) => void
    randomContactAdded: (peerDescriptor: PeerDescriptor) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor) => void
    ringContactAdded: (peerDescriptor: PeerDescriptor) => void
    ringContactRemoved: (peerDescriptor: PeerDescriptor) => void
}

export interface Layer1Node {
    on<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    once<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    off<T extends keyof Layer1NodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    removeContact: (nodeId: DhtAddress) => void
    getClosestContacts: (maxCount?: number) => PeerDescriptor[]
    getRandomContacts: () => PeerDescriptor[]
    getRingContacts: () => RingContacts
    getNeighbors: () => PeerDescriptor[]
    getNeighborCount(): number
    joinDht: (entryPoints: PeerDescriptor[], doRandomJoin?: boolean, retry?: boolean) => Promise<void>
    joinRing: () => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
}
