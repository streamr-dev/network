import { DhtAddress, DhtNodeEvents, PeerDescriptor, RingContacts } from '@streamr/dht'
import { EventEmitterType } from '@streamr/utils'

export interface DiscoveryLayerNodeEvents {
    manualRejoinRequired: () => void
    nearbyContactAdded: (peerDescriptor: PeerDescriptor) => void
    nearbyContactRemoved: (peerDescriptor: PeerDescriptor) => void
    randomContactAdded: (peerDescriptor: PeerDescriptor) => void
    randomContactRemoved: (peerDescriptor: PeerDescriptor) => void
    ringContactAdded: (peerDescriptor: PeerDescriptor) => void
    ringContactRemoved: (peerDescriptor: PeerDescriptor) => void
}
export interface DiscoveryLayerNode extends EventEmitterType<DiscoveryLayerNodeEvents> {
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
