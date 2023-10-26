import EncryptedGroupKey from './EncryptedGroupKey'
import MessageID from './MessageID'
import MessageRef from './MessageRef'
import { binaryToUtf8 } from '@streamr/utils'

export const createSignaturePayload = (opts: {
    messageId: MessageID
    serializedContent: Uint8Array
    prevMsgRef?: MessageRef
    newGroupKey?: EncryptedGroupKey
}): Uint8Array => {

    // Legacy payload generation
    const prev = ((opts.prevMsgRef !== undefined) ? `${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}` : '')
    const newGroupKey = ((opts.newGroupKey !== undefined) ? opts.newGroupKey.serialize() : '')
    return Buffer.from(`${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}${opts.messageId.sequenceNumber}`
        + `${opts.messageId.publisherId}${opts.messageId.msgChainId}${prev}${binaryToUtf8((opts.serializedContent))}${newGroupKey}`, 'utf8')
}
