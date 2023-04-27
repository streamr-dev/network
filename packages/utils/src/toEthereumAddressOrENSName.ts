import { EthereumAddress, toEthereumAddress } from './EthereumAddress'
import { ENSName, isENSNameFormatIgnoreCase, toENSName } from './ENSName'

export function toEthereumAddressOrENSName(str: string): EthereumAddress | ENSName | never {
    return isENSNameFormatIgnoreCase(str) ? toENSName(str) : toEthereumAddress(str)
}
