import { toUserId } from '@streamr/utils'
import { MessageID, MessageRef } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { DuplicateMessageDetector, NumberPair } from './DuplicateMessageDetector'

export const markAndCheckDuplicate = (
    duplicateDetectors: Map<string, DuplicateMessageDetector>,
    currentMessage: MessageID,
    previousMessageRef?: MessageRef
): boolean => {
    const detectorKey = `${toUserId(currentMessage.publisherId)}-${currentMessage.messageChainId}`
    const previousNumberPair = previousMessageRef
        ? new NumberPair(Number(previousMessageRef.timestamp), previousMessageRef.sequenceNumber)
        : null
    const currentNumberPair = new NumberPair(Number(currentMessage.timestamp), currentMessage.sequenceNumber)
    if (!duplicateDetectors.has(detectorKey)) {
        duplicateDetectors.set(detectorKey, new DuplicateMessageDetector())
    }
    return duplicateDetectors.get(detectorKey)!.markAndCheck(previousNumberPair, currentNumberPair)
}
