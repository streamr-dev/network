import { areEqualBinaries } from '@streamr/utils'
import { PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey, createPeerIDKey } from './PeerID'
import { DhtAddress, getDhtAddressFromRaw } from '../identifiers'

export const peerIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerID => {
    return PeerID.fromValue(peerDescriptor.nodeId)
}

export const getNodeIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): DhtAddress => {
    return getDhtAddressFromRaw(peerDescriptor.nodeId)
}

export const keyFromPeerDescriptor = (peerDescriptor: PeerDescriptor): PeerIDKey => {
    return createPeerIDKey(peerDescriptor.nodeId)
}

export const areEqualPeerDescriptors = (peerDescriptor1: PeerDescriptor, peerDescriptor2: PeerDescriptor): boolean => {
    return areEqualBinaries(peerDescriptor1.nodeId, peerDescriptor2.nodeId)
}
