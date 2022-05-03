import { PeerDescriptor } from '../proto/DhtRpc'

export const generateId = (stringId: string): Uint8Array => {
    return Uint8Array.from(Buffer.from(stringId))
}

export const nodeFormatPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerDescriptor => {
    const formatted: PeerDescriptor = {
        ...peerDescriptor,
        peerId: Uint8Array.from(peerDescriptor.peerId)
    }
    return formatted
}