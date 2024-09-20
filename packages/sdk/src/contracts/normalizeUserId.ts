import { UserID } from '@streamr/trackerless-network'

/**
 * Zero-pads the given data to the specified length.
 */
function zeroPad(data: Uint8Array, length: number): Uint8Array {
    const result = new Uint8Array(length)
    result.set(data, length - data.length)
    return result
}

/**
 * Used to normalize a userId before passing it to the StreamRegistry contract.
 *
 * This is necessary due to legacy reasons. For the long story, read below.
 *
 * Beforehand we only supported Ethereum addresses as userIds. For an apparently arbitrary reason, the StreamRegistry
 * contracts V4 and below were built so that they would always pad the userId to 32 bytes before using them internally.
 * However, the new *userId* functions in StreamRegistry V5 do not do this padding. This means that if were to pass a
 * userId representing an Ethereum address as-is to an V5 contract (that was originally V4, but now upgraded), it would
 * not be able to find the stream permissions that were registered with the same userId when the contract was still in v4.
 *
 * By padding all userIds below 32 bytes to 32 bytes, we ensure that the userId compatibility remains. A downside is that
 * we needlessly pad userIds that do not represent Ethereum addresses and are less than 32 bytes long. If we wanted to
 * avoid doing this we would have to carry along information about what a userId represents complicating the code further
 * We have decided that in this instance the simplicity of the code is more important than the performance of the contract.
 *
 */
export function normalizeUserId(userId: UserID): Uint8Array {
    const MIN_LENGTH = 32
    return userId.length >= MIN_LENGTH ? userId : zeroPad(userId, MIN_LENGTH)
}
