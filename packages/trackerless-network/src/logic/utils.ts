import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector' 
import { MessageRef } from '../proto/packages/trackerless-network/protos/NetworkRpc'

export const markAndCheckDuplicate = (
    duplicateDetectors: Map<string, DuplicateMessageDetector>,
    currentMessageRef: MessageRef, 
    previousMessageRef?: MessageRef
): boolean => {
    const detectorKey = `${BinaryTranslator.toUTF8(currentMessageRef.publisherId)}-${currentMessageRef.messageChainId}`
    const previousNumberPair = previousMessageRef ?
        new NumberPair(Number(previousMessageRef!.timestamp), previousMessageRef!.sequenceNumber) : null
    const currentNumberPair = new NumberPair(Number(currentMessageRef.timestamp), currentMessageRef.sequenceNumber)
    if (!duplicateDetectors.has(detectorKey)) {
        duplicateDetectors.set(detectorKey, new DuplicateMessageDetector())
    }
    return duplicateDetectors.get(detectorKey)!.markAndCheck(previousNumberPair, currentNumberPair)
}

export class BinaryTranslator {

    private static readonly textEncoder = new TextEncoder() 
    private static readonly textDecoder = new TextDecoder()

    static toUTF8(bytes: Uint8Array): string {
        return this.textDecoder.decode(bytes)
    }

    static toBinary(utf8: string): Uint8Array {
        return this.textEncoder.encode(utf8)
    }
}
