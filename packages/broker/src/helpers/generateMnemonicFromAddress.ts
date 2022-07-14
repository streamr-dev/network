import { entropyToMnemonic } from '@ethersproject/hdnode'
import { EthereumAddress } from 'streamr-client-protocol/dist/src/utils/types'

/**
 * @param address - valid eth address with leading 0x
 */
export const generateMnemonicFromAddress = (address: EthereumAddress): string => {
    const prefixedAddress = typeof address === 'string' && !address.startsWith('0x') ? `0x${address}` : address
    return entropyToMnemonic(prefixedAddress)
        .split(' ')
        .slice(0, 3)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}
