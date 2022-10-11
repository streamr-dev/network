import { BrandedString } from './types'

const REGEX = /^0x[a-fA-F0-9]{40}$/

export type EthereumAddress = BrandedString<'EthereumAddress'>

export function toEthereumAddress(str: string): EthereumAddress | never {
    if (str.match(REGEX)) {
        return str.toLowerCase() as EthereumAddress
    }
    throw new Error(`not a valid Ethereum address: "${str}"`)
}
