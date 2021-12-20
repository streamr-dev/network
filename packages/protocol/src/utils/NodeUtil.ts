import { entropyToMnemonic } from '@ethersproject/hdnode'

/**
 * @param address - valid eth address with leading 0x
 */
export const generateMnemonicFromAddress = (address: string): string => {
    const prefixedAddress = typeof address === 'string' && !address.startsWith('0x') ? `0x${address}` : address
    return entropyToMnemonic(prefixedAddress)
        .split(' ')
        .slice(0, 3)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

/**
 * @param id - node id
 */
export const parseAddressFromNodeId = (id: string): string => {
    const hashPos = id.indexOf('#')

    if (hashPos < 0) {
        return id
    }

    return id.slice(0, hashPos)
}
