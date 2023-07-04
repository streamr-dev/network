import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from './PeerID'

export const peerIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerID => {
    return PeerID.fromValue(peerDescriptor.kademliaId)
}

export const keyFromPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerIDKey => {
    return PeerID.fromValue(peerDescriptor.kademliaId).toKey()
}

export const isSamePeerDescriptor = (peerDescriptor1: PeerDescriptor, peerDescriptor2: PeerDescriptor): boolean => {
    return peerIdFromPeerDescriptor(peerDescriptor1).equals(peerIdFromPeerDescriptor(peerDescriptor2))
}
