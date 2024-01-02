import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey, createPeerIDKey } from './PeerID'

export const peerIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerID => {
    return PeerID.fromValue(peerDescriptor.nodeId)
}

export const keyFromPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerIDKey => {
    return createPeerIDKey(peerDescriptor.nodeId)
}
