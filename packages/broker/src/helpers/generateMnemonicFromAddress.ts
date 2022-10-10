import { entropyToMnemonic } from '@ethersproject/hdnode'
import { EthereumAddress } from '@streamr/utils'

/**
 * @param address - valid eth address with leading 0x
 */
export const generateMnemonicFromAddress = (address: EthereumAddress): string => {
    return entropyToMnemonic(address)
        .split(' ')
        .slice(0, 3)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}
