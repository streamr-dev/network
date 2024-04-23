import { DhtAddress, DhtNodeEvents, PeerDescriptor, RingContacts } from '@streamr/dht'

export type Layer1NodeEvents = Pick<DhtNodeEvents, 'manualRejoinRequired' | 'closestContactAdded' 
    | 'closestContactRemoved' | 'randomContactAdded' | 'randomContactRemoved' | 'ringContactAdded' | 'ringContactRemoved'>

export interface Layer1Node {
    // TODO: Why do on, once and off need to be defined multiple times per function type?
    on<T extends keyof Layer1NodeEvents>(eventName: T, listener: Layer1NodeEvents[T]): void
    on<T extends keyof Layer1NodeEvents>(eventName: T, listener: Layer1NodeEvents[T]): void
    once<T extends keyof Layer1NodeEvents>(eventName: T, listener: Layer1NodeEvents[T]): void
    once<T extends keyof Layer1NodeEvents>(eventName: T, listener: Layer1NodeEvents[T]): void
    off<T extends keyof Layer1NodeEvents>(eventName: T, listener: Layer1NodeEvents[T]): void
    off<T extends keyof Layer1NodeEvents>(eventName: T, listener: Layer1NodeEvents[T]): void
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
