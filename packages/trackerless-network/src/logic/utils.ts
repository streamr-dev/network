import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector' 
import { MessageID, MessageRef } from '../proto/packages/trackerless-network/protos/NetworkRpc'

export const markAndCheckDuplicate = (
    duplicateDetectors: Map<string, DuplicateMessageDetector>,
    currentMessage: MessageID, 
    previousMessageRef?: MessageRef
): boolean => {
    const detectorKey = `${toUTF8(currentMessage.publisherId)}-${currentMessage.messageChainId}`
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

export const toUTF8 = (bytes: Uint8Array): string => {
    return textDecoder.decode(bytes)
}

export const toBinary = (utf8: string): Uint8Array => {
    return textEncoder.encode(utf8)
}
