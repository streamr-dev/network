import ValidationError from '../../errors/ValidationError'
import EncryptedGroupKey from './EncryptedGroupKey'
import MessageID from './MessageID'
import MessageRef from './MessageRef'
import { SignatureType } from './StreamMessage'

export const createSignaturePayload = (opts: {
    signatureType: SignatureType
    messageId: MessageID
    serializedContent: string
    prevMsgRef?: MessageRef
    newGroupKey?: EncryptedGroupKey
}): string => {
    if (opts.signatureType === SignatureType.ETH) {
        const prev = ((opts.prevMsgRef !== undefined) ? `${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}` : '')
        const newGroupKey = ((opts.newGroupKey !== undefined) ? opts.newGroupKey.serialize() : '')
        return `${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}${opts.messageId.sequenceNumber}`
            + `${opts.messageId.publisherId.toLowerCase()}${opts.messageId.msgChainId}${prev}${opts.serializedContent}${newGroupKey}`
    }
    throw new ValidationError(`Unrecognized signature type: ${opts.signatureType}`)
}
