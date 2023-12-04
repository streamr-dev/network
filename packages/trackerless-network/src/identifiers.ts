import { PeerDescriptor } from '@streamr/dht'
import { BrandedString, binaryToHex } from '@streamr/utils'

export type NodeID = BrandedString<'NodeID'>

export const getNodeIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): NodeID => {
    return binaryToHex(peerDescriptor.nodeId) as unknown as NodeID
}
