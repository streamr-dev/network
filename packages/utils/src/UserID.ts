import { EthereumAddress, toEthereumAddress } from './EthereumAddress'

export type UserID = EthereumAddress

export const toUserId = (value: string): UserID => {
    return toEthereumAddress(value)
}
