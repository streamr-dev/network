import { PeerIDKey } from '../helpers/PeerID'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { RemoteDhtNode } from './RemoteDhtNode'

export interface IPeerManager {
    getClosestPeersTo(kademliaId: Uint8Array, limit?: number, excludeSet?: Set<PeerIDKey>): RemoteDhtNode[]
    getNumberOfPeers(excludeSet?: Set<PeerIDKey>): number
    getNumberOfConnections(): number
    handlePeerActive(peer: RemoteDhtNode): void
    handlePeerUnresponsive(peer: RemoteDhtNode): void
    handleNewPeers(peerDescriptors: PeerDescriptor[], setActive?: boolean): void
    getDistance(kademliaId1: Uint8Array, kademliaId2: Uint8Array): number
    getKBucketSize(): number
}
