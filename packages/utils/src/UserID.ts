import { EthereumAddress, toEthereumAddress } from './EthereumAddress'

export type UserID = EthereumAddress

const REGEX = /^0x[a-fA-F0-9]+$/

export const toUserId = (input: string): UserID => {
    return toEthereumAddress(input)
}

export const isValidUserId = (input: string): boolean => {
    return REGEX.test(input)
}
