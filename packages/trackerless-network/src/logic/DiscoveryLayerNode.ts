import { DhtAddress, PeerDescriptor, RingContacts, ServiceID } from '@streamr/dht'
import { StreamPartID } from '@streamr/utils'

export const DEFAULT_DISCOVERY_LAYER_KBUCKET_SIZE = 4
export const DEFAULT_DISCOVERY_LAYER_JOIN_TIMEOUT = 20000
export const DEFAULT_DISCOVERY_LAYER_NEIGHBOR_PING_LIMIT = 16
export const DEFAULT_DISCOVERY_LAYER_PERIODICALLY_PING_NEIGHBORS = true
export const DEFAULT_DISCOVERY_LAYER_PERIODICALLY_PING_RING_CONTACTS = true

export const formDiscoveryLayerServiceId = (streamPartId: StreamPartID): ServiceID => 'layer1::' + streamPartId

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
    off<T extends keyof DiscoveryLayerNodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
    off<T extends keyof DiscoveryLayerNodeEvents>(eventName: T, listener: () => void): void
    once<T extends keyof DiscoveryLayerNodeEvents>(eventName: T, listener: (peerDescriptor: PeerDescriptor) => void): void
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
