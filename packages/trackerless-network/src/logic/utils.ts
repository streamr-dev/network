import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector' 
import { MessageID, MessageRef } from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { UserID } from '../identifiers'

export const markAndCheckDuplicate = (
    duplicateDetectors: Map<string, DuplicateMessageDetector>,
    currentMessage: MessageID, 
    previousMessageRef?: MessageRef
): boolean => {
    const detectorKey = `${binaryToHex(currentMessage.publisherId)}-${currentMessage.messageChainId}`
    const previousNumberPair = previousMessageRef ?
        new NumberPair(Number(previousMessageRef!.timestamp), previousMessageRef!.sequenceNumber) : null
    const currentNumberPair = new NumberPair(Number(currentMessage.timestamp), currentMessage.sequenceNumber)
    if (!duplicateDetectors.has(detectorKey)) {
        duplicateDetectors.set(detectorKey, new DuplicateMessageDetector())
    }
    return duplicateDetectors.get(detectorKey)!.markAndCheck(previousNumberPair, currentNumberPair)
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export const binaryToUtf8 = (bytes: Uint8Array): string => {
    return textDecoder.decode(bytes)
}

export const utf8ToBinary = (utf8: string): Uint8Array => {
    return textEncoder.encode(utf8)
}

export const binaryToHex = (bytes: Uint8Array, addPrefix = false): string => {
    if (addPrefix) {
        return `0x${Buffer.from(bytes).toString('hex')}`
    }
    return Buffer.from(bytes).toString('hex')
}

export const hexToBinary = (hex: string): Uint8Array => {
    if (hex.startsWith('0x')) {
        hex = hex.slice(2)
    }
    return Buffer.from(hex, 'hex')
}

export const areEqualUsers = (userId1: UserID, userId2: UserID): boolean => {
    return areEqualByteArrays(userId1, userId2)
}

const areEqualByteArrays = (arr1: Uint8Array, arr2: Uint8Array): boolean => {
    if (arr1.byteLength === arr2.byteLength) {
        return arr1.every((value, index) => value === arr2[index])
    } else {
        return false
    }
}
