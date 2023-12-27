import { BrandedString, binaryToHex, hexToBinary } from '@streamr/utils'
import crypto from 'crypto'

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

export const createRandomDhtAddress = (): DhtAddress => {
    return getDhtAddressFromRaw(crypto.randomBytes(KADEMLIA_ID_LENGTH_IN_BYTES))
}

