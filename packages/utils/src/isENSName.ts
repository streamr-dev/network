import type { EthereumAddress } from './EthereumAddress'
import { type ENSName, isENSNameFormatIgnoreCase } from './ENSName'

export function isENSName(domain: EthereumAddress | ENSName): domain is ENSName {
    return isENSNameFormatIgnoreCase(domain)
}
