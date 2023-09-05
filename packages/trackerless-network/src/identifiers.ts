import { PeerDescriptor, keyFromPeerDescriptor } from '@streamr/dht'
import { BrandedString, EthereumAddress } from '@streamr/utils'

export type NodeID = BrandedString<'NodeID'>

export type UserID = EthereumAddress

export const getNodeIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): NodeID => {
    return keyFromPeerDescriptor(peerDescriptor) as unknown as NodeID
}
