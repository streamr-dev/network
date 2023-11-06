import { PeerIDKey } from '../helpers/PeerID'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { DhtNodeRpcRemote } from './DhtNodeRpcRemote'

export interface IPeerManager {
    getClosestPeersTo(kademliaId: Uint8Array, limit?: number, excludeSet?: Set<PeerIDKey>): DhtNodeRpcRemote[]
    getNumberOfPeers(excludeSet?: Set<PeerIDKey>): number
    getNumberOfConnections(): number
    handlePeerActive(peer: DhtNodeRpcRemote): void
    handlePeerUnresponsive(peer: DhtNodeRpcRemote): void
    handleNewPeers(peerDescriptors: PeerDescriptor[], setActive?: boolean): void
    getDistance(kademliaId1: Uint8Array, kademliaId2: Uint8Array): number
    getKBucketSize(): number
}
