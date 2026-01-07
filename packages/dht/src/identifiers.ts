import { BrandedString, areEqualBinaries, binaryToHex, hexToBinary, randomBytes } from '@streamr/utils'
import { PeerDescriptor } from '../generated/packages/dht/protos/DhtRpc'

// https://www.scs.stanford.edu/~dm/home/papers/kpos.pdf
export const KADEMLIA_ID_LENGTH_IN_BYTES = 20

export type DhtAddress = BrandedString<'DhtAddress'>
export type DhtAddressRaw = Uint8Array

export const toDhtAddress = (raw: DhtAddressRaw): DhtAddress => {
    return binaryToHex(raw) as unknown as DhtAddress
}

export const toDhtAddressRaw = (address: DhtAddress): DhtAddressRaw => {
    return hexToBinary(address) as unknown as DhtAddressRaw
}

export const toNodeId = (peerDescriptor: PeerDescriptor): DhtAddress => {
    return toDhtAddress(peerDescriptor.nodeId)
}

export const areEqualPeerDescriptors = (peerDescriptor1: PeerDescriptor, peerDescriptor2: PeerDescriptor): boolean => {
    return areEqualBinaries(peerDescriptor1.nodeId, peerDescriptor2.nodeId)
}

export const randomDhtAddress = (): DhtAddress => {
    return toDhtAddress(randomBytes(KADEMLIA_ID_LENGTH_IN_BYTES))
}
