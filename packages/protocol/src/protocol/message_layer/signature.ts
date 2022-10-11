import EncryptedGroupKey from './EncryptedGroupKey'
import MessageID from './MessageID'
import MessageRef from './MessageRef'

export const createSignaturePayload = (opts: {
    messageId: MessageID
    serializedContent: string
    prevMsgRef?: MessageRef
    newGroupKey?: EncryptedGroupKey
}): string => {
    const prev = ((opts.prevMsgRef !== undefined) ? `${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}` : '')
    const newGroupKey = ((opts.newGroupKey !== undefined) ? opts.newGroupKey.serialize() : '')
    return `${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}${opts.messageId.sequenceNumber}`
        + `${opts.messageId.publisherId.toLowerCase()}${opts.messageId.msgChainId}${prev}${opts.serializedContent}${newGroupKey}`
}
