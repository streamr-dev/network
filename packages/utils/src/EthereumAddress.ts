import { BrandedString } from './types'

const REGEX = /^0x[a-fA-F0-9]{40}$/
const ETHEREUM_ADDRESS_LENGTH_IN_BYTES = 20

export type EthereumAddress = BrandedString<'EthereumAddress'>

export function toEthereumAddress(str: string): EthereumAddress | never {
    if (str.match(REGEX)) {
        return str.toLowerCase() as EthereumAddress
    }
    throw new Error(`not a valid Ethereum address: "${str}"`)
}

export const isEthereumAddressByteArray = (userId: Uint8Array): boolean => {
    return userId.length === ETHEREUM_ADDRESS_LENGTH_IN_BYTES
}
