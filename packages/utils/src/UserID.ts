import { binaryToHex, hexToBinary } from './binaryUtils'
import { PREFIXED_STRING_LENGTH } from './EthereumAddress'
import { BrandedString } from './types'

const REGEX = /^0x[a-fA-F0-9]+$/

export type UserID = BrandedString<'UserID'>
export type UserIDRaw = Uint8Array

export const toUserId = (input: string | UserIDRaw): UserID | never => {
    if (input instanceof Uint8Array) {
        return binaryToHex(input, true) as UserID
    } else {
        if (isValidUserId(input)) {
            return input.toLowerCase() as UserID
        }
        throw new Error(`not a valid UserID: "${input}"`)
    }
}

export const toUserIdRaw = (userId: UserID): UserIDRaw => {
    return hexToBinary(userId)
}

export const isValidUserId = (input: string): boolean => {
    return REGEX.test(input)
}

export const isEthereumAddressUserId = (userId: UserID): boolean => {
    return userId.length === PREFIXED_STRING_LENGTH
}
