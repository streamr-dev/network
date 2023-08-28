import { binaryToHex, hexToBinary } from './binaryUtils'
import { BrandedString } from './types'

const REGEX = /^0x[a-fA-F0-9]{40}$/

export type EthereumAddress = BrandedString<'EthereumAddress'>
export type EthereumAddressByteArray = Uint8Array

export function toEthereumAddress(str: string): EthereumAddress | never {
    if (str.match(REGEX)) {
        return str.toLowerCase() as EthereumAddress
    }
    throw new Error(`not a valid Ethereum address: "${str}"`)
}

export function ethereumAddressToByteArray(ethereumAddress: EthereumAddress): EthereumAddressByteArray {
    return hexToBinary(ethereumAddress)
}

export function byteArrayToEthereumAddress(byteArray: EthereumAddressByteArray): EthereumAddress {
    return toEthereumAddress(binaryToHex(byteArray, true))
}
