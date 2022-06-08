import { PeerID } from './PeerID'
import { PeerDescriptor } from '../proto/DhtRpc'

export const generateId = (stringId: string): Uint8Array => {
    return PeerID.fromString(stringId).value
}

export const nodeFormatPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerDescriptor => {
    const formatted: PeerDescriptor = {
        ...peerDescriptor,
        peerId: Uint8Array.from(peerDescriptor.peerId)
    }
    return formatted
}
