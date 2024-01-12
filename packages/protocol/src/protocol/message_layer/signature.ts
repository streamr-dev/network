import EncryptedGroupKey from './EncryptedGroupKey'
import MessageID from './MessageID'
import MessageRef from './MessageRef'
import { binaryToHex, binaryToUtf8 } from '@streamr/utils'
import { EncryptionType, SignatureType } from './StreamMessage'

const serializeGroupKey = ({ id, data }: EncryptedGroupKey): string => {
    return JSON.stringify([id, binaryToHex(data)])
}

export const createSignaturePayload = (opts: {
    messageId: MessageID
    content: Uint8Array
    signatureType: SignatureType
    encryptionType: EncryptionType
    prevMsgRef?: MessageRef
    newGroupKey?: EncryptedGroupKey
}): Uint8Array => {

    if (opts.signatureType == SignatureType.SECP256K1) {
        const header = Buffer.from(`${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}`
            + `${opts.messageId.sequenceNumber}${opts.messageId.publisherId}${opts.messageId.msgChainId}`)

        const prevMsgRef = (opts.prevMsgRef !== undefined) ? Buffer.from(`${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}`) : undefined

        const newGroupKeyId = opts.newGroupKey ? Buffer.from(opts.newGroupKey.id) : undefined

        return Buffer.concat([
            header,
            opts.content,
            prevMsgRef || new Uint8Array(0),
            newGroupKeyId || new Uint8Array(0),
            opts.newGroupKey?.data || new Uint8Array(0),
        ])

    } else if (opts.signatureType === SignatureType.LEGACY_SECP256K1) {
        const prev = ((opts.prevMsgRef !== undefined) ? `${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}` : '')
        const newGroupKey = ((opts.newGroupKey !== undefined) ? serializeGroupKey(opts.newGroupKey) : '')

        // In the legacy signature type, encrypted content was signed as a hex-encoded string
        const contentAsString = (opts.encryptionType === EncryptionType.NONE ?
            binaryToUtf8(opts.content) : binaryToHex(opts.content))

        return Buffer.from(`${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}${opts.messageId.sequenceNumber}`
            + `${opts.messageId.publisherId}${opts.messageId.msgChainId}${prev}${contentAsString}${newGroupKey}`)

    } else {
        throw new Error(`Unsupported SignatureType: ${SignatureType}`)
    }
}
