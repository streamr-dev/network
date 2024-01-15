import { BrandedString, areEqualBinaries, binaryToHex, hexToBinary } from '@streamr/utils'
import crypto from 'crypto'
import { ConnectivityMethod, PeerDescriptor } from './proto/packages/dht/protos/DhtRpc'

// https://www.scs.stanford.edu/~dm/home/papers/kpos.pdf
const KADEMLIA_ID_LENGTH_IN_BYTES = 20

export type DhtAddress = BrandedString<'DhtAddress'>
export type DhtAddressRaw = Uint8Array

export const getDhtAddressFromRaw = (raw: DhtAddressRaw): DhtAddress => {
    return binaryToHex(raw) as unknown as DhtAddress
}

export const getRawFromDhtAddress = (address: DhtAddress): DhtAddressRaw => {
    return hexToBinary(address) as unknown as DhtAddressRaw
}

export const getNodeIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): DhtAddress => {
    return getDhtAddressFromRaw(peerDescriptor.nodeId)
}

export const areEqualPeerDescriptors = (peerDescriptor1: PeerDescriptor, peerDescriptor2: PeerDescriptor): boolean => {
    return areEqualBinaries(peerDescriptor1.nodeId, peerDescriptor2.nodeId)
}

export const createRandomDhtAddress = (): DhtAddress => {
    return getDhtAddressFromRaw(crypto.randomBytes(KADEMLIA_ID_LENGTH_IN_BYTES))
}

export const serializePeerDescriptorForSigning = (peerDescriptor: PeerDescriptor): Uint8Array => {
    const undefinedBuffer = Buffer.from('undefined')
    const buffers = [ 
        peerDescriptor.type !== undefined ? Buffer.from([peerDescriptor.type]) : undefinedBuffer,
        peerDescriptor.udp !== undefined ? ConnectivityMethod.toBinary(peerDescriptor.udp) : undefinedBuffer,
        peerDescriptor.tcp !== undefined ? ConnectivityMethod.toBinary(peerDescriptor.tcp) : undefinedBuffer,
        peerDescriptor.websocket !== undefined ? ConnectivityMethod.toBinary(peerDescriptor.websocket) : undefinedBuffer,
        peerDescriptor.region !== undefined ? Buffer.from([peerDescriptor.region]) : undefinedBuffer,
        peerDescriptor.ipAddress !== undefined ? Buffer.from([peerDescriptor.ipAddress]) : undefinedBuffer,
        peerDescriptor.salt !== undefined ? Buffer.from(peerDescriptor.salt) : undefinedBuffer
    ]
    return Buffer.concat(buffers)
}
