import { DuplicateMessageDetector, NumberPair } from "./DuplicateMessageDetector" 
import { MessageRef } from "../proto/packages/trackerless-network/protos/NetworkRpc"

export const markAndCheckDuplicate = (
    duplicateDetectors: Map<string, DuplicateMessageDetector>,
    currentMessageRef: MessageRef, 
    previousMessageRef?: MessageRef
): boolean => {
    const detectorKey = `${currentMessageRef.publisherId}-${currentMessageRef.messageChainId}`
    const previousNumberPair = previousMessageRef ?
        new NumberPair(Number(previousMessageRef!.timestamp), previousMessageRef!.sequenceNumber) : null
    const currentNumberPair = new NumberPair(Number(currentMessageRef.timestamp), currentMessageRef.sequenceNumber)
    if (!duplicateDetectors.has(detectorKey)) {
        duplicateDetectors.set(detectorKey, new DuplicateMessageDetector())
    }
    return duplicateDetectors.get(detectorKey)!.markAndCheck(previousNumberPair, currentNumberPair)
}
