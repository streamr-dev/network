import { EthereumAddress } from './EthereumAddress'
import { ENSName, isENSNameFormatIgnoreCase } from './ENSName'

export function isENSName(domain: EthereumAddress | ENSName): domain is ENSName {
    return isENSNameFormatIgnoreCase(domain)
}
