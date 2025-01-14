import { binaryToHex, binaryToUtf8 } from '@streamr/utils'
import { EncryptedGroupKey } from '../protocol/EncryptedGroupKey'
import { MessageID } from '../protocol/MessageID'
import { MessageRef } from '../protocol/MessageRef'
import { EncryptionType } from '../protocol/StreamMessage'

const serializeGroupKey = ({ id, data }: EncryptedGroupKey): string => {
    return JSON.stringify([id, binaryToHex(data)])
}

/**
 * Only to be used for LEGACY_SECP256K1 signature type.
 */
export const createLegacySignaturePayload = (opts: {
    messageId: MessageID
    content: Uint8Array
    encryptionType: EncryptionType
    prevMsgRef?: MessageRef
    newGroupKey?: EncryptedGroupKey
}): Uint8Array => {
    const prev = opts.prevMsgRef !== undefined ? `${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}` : ''
    const newGroupKey = opts.newGroupKey !== undefined ? serializeGroupKey(opts.newGroupKey) : ''
    // In the legacy signature type, encrypted content was signed as a hex-encoded string
    const contentAsString =
        opts.encryptionType === EncryptionType.NONE ? binaryToUtf8(opts.content) : binaryToHex(opts.content)
    return Buffer.from(
        `${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}${opts.messageId.sequenceNumber}` +
            `${opts.messageId.publisherId}${opts.messageId.msgChainId}${prev}${contentAsString}${newGroupKey}`
    )
}
