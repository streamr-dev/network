import { PeerID } from '../types'
import { PeerDescriptor } from '../proto/DhtRpc'

export const generateId = (stringId: string): Uint8Array => {
    return Uint8Array.from(Buffer.from(stringId))
}

export const stringFromId = (id: PeerID): string => {
    return Buffer.from(id.buffer).toString()
}

export const nodeFormatPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerDescriptor => {
    const formatted: PeerDescriptor = {
        ...peerDescriptor,
        peerId: Uint8Array.from(peerDescriptor.peerId)
    }
    return formatted
}