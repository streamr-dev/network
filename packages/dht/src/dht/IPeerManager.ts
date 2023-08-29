import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { DhtPeer } from './DhtPeer'

export interface IPeerManager {
    getClosestPeersTo(kademliaId: Uint8Array, limit?: number, exclude?: Set<DhtPeer>): DhtPeer[]
    getNumberOfPeers(exclude?: Set<DhtPeer>): number
    handlePeerActive(peer: DhtPeer): void
    handlePeerUnresponsive(peer: DhtPeer): void
    handleNewPeers(peerDescriptors: PeerDescriptor[], setActive?: boolean): void
}
