import { DhtAddress, PeerDescriptor, RingContacts } from '@streamr/dht'

export interface DiscoveryLayerNodeEvents {
    manualRejoinRequired: () => void
    nearbyContactAdded: (peerDescriptor: PeerDescriptor) => void
    nearbyContactRemoved: (peerDescriptor: PeerDescriptor) => void
    randomContactAdded: (peerDescriptor: PeerDescriptor) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor) => void
    ringContactAdded: (peerDescriptor: PeerDescriptor) => void
    ringContactRemoved: (peerDescriptor: PeerDescriptor) => void
}

export interface DiscoveryLayerNode {
    on<T extends keyof DiscoveryLayerNodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    on<T extends keyof DiscoveryLayerNodeEvents>(eventName: T, listener: () => void): void
    off<T extends keyof DiscoveryLayerNodeEvents>(
        eventName: T,
        listener: (peerDescriptor: PeerDescriptor) => void
    ): void
    off<T extends keyof DiscoveryLayerNodeEvents>(eventName: T, listener: () => void): void
    once<T extends keyof DiscoveryLayerNodeEvents>(
        eventName: T,
        listener: (peerDescriptor: PeerDescriptor) => void
    ): void
    once<T extends keyof DiscoveryLayerNodeEvents>(eventName: T, listener: () => void): void
    removeContact: (nodeId: DhtAddress) => void
    getClosestContacts: (maxCount?: number) => PeerDescriptor[]
    getRandomContacts: (maxCount?: number) => PeerDescriptor[]
    getRingContacts: () => RingContacts
    getNeighbors: () => PeerDescriptor[]
    getNeighborCount(): number
    joinDht: (entryPoints: PeerDescriptor[], doRandomJoin?: boolean, retry?: boolean) => Promise<void>
    joinRing: () => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
}
