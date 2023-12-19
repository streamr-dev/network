import { areEqualBinaries } from '@streamr/utils'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey, createPeerIDKey } from './PeerID'
import { NodeID, getNodeIdFromRaw } from '../identifiers'

export const peerIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerID => {
    return PeerID.fromValue(peerDescriptor.nodeId)
}

// TODO could use this in trackerless-network (instead of copy-pasted same implementation)
// and move this to nodeId.ts
export const getNodeIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): NodeID => {
    return getNodeIdFromRaw(peerDescriptor.nodeId)
}

export const keyFromPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerIDKey => {
    return createPeerIDKey(peerDescriptor.nodeId)
}

export const areEqualPeerDescriptors = (peerDescriptor1: PeerDescriptor, peerDescriptor2: PeerDescriptor): boolean => {
    return areEqualBinaries(peerDescriptor1.nodeId, peerDescriptor2.nodeId)
}
