import EncryptedGroupKey from './EncryptedGroupKey'
import MessageID from './MessageID'
import MessageRef from './MessageRef'
import { binaryToHex, binaryToUtf8 } from '@streamr/utils'

const serializeGroupKey = ({ groupKeyId, data }: EncryptedGroupKey): string => {
    return JSON.stringify([groupKeyId, binaryToHex(data)])
}

export const createSignaturePayload = (opts: {
    messageId: MessageID
    content: Uint8Array
    prevMsgRef?: MessageRef
    newGroupKey?: EncryptedGroupKey
}): Uint8Array => {
    // Legacy payload generation
    const prev = ((opts.prevMsgRef !== undefined) ? `${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}` : '')
    const newGroupKey = ((opts.newGroupKey !== undefined) ? serializeGroupKey(opts.newGroupKey) : '')
    return Buffer.from(`${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}${opts.messageId.sequenceNumber}`
        + `${opts.messageId.publisherId}${opts.messageId.msgChainId}${prev}${binaryToUtf8((opts.content))}${newGroupKey}`)
}
