import { DhtAddress, DhtNodeEvents, PeerDescriptor, RingContacts } from '@streamr/dht'
import { EventEmitterType } from '@streamr/utils'

export type Layer1NodeEvents = Pick<DhtNodeEvents, 'manualRejoinRequired' | 'nearbyContactAdded' 
    | 'nearbyContactRemoved' | 'randomContactAdded' | 'randomContactRemoved' | 'ringContactAdded' | 'ringContactRemoved'>

export interface Layer1Node extends EventEmitterType<Layer1NodeEvents> {
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
