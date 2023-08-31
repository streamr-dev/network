import { PeerIDKey } from '../exports'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { DhtPeer } from './DhtPeer'

export interface IPeerManager {
    getClosestPeersTo(kademliaId: Uint8Array, limit?: number, excludeSet?: Set<PeerIDKey>): DhtPeer[]
    getNumberOfPeers(excludeSet?: Set<PeerIDKey>): number
    handlePeerActive(peer: DhtPeer): void
    handlePeerUnresponsive(peer: DhtPeer): void
    handleNewPeers(peerDescriptors: PeerDescriptor[], setActive?: boolean): void
    getDistance(kademliaId1: Uint8Array, kademliaId2: Uint8Array): number
    getKBucketSize(): number
}
