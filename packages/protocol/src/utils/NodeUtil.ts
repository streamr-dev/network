import { entropyToMnemonic, wordlists } from 'bip39'

/**
 * @param address - valid eth address with leading 0x
 */
export const generateMnemonicFromAddress = (address: string) =>
    entropyToMnemonic(address.slice(2), wordlists.english)
        .split(' ')
        .slice(0, 3)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

/**
 * @param id - node id
 */
export const parseAddressFromNodeId = (id: string) => {
    const hashPos = id.indexOf('#')

    if (hashPos < 0) {
        return id
    }

    return id.slice(0, hashPos)
}
