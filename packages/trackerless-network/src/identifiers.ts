import { PeerDescriptor, keyFromPeerDescriptor } from '@streamr/dht'
import { BrandedString } from '@streamr/utils'

export type NodeID = BrandedString<'NodeID'>

export type UserID = Uint8Array

export const getNodeIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): NodeID => {
    return keyFromPeerDescriptor(peerDescriptor) as unknown as NodeID
}
