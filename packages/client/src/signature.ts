import { EncryptedGroupKey, EncryptionType, MessageID, MessageRef, SignatureType, StreamMessageType } from '@streamr/protocol'
import { binaryToHex, binaryToUtf8, utf8ToBinary } from '@streamr/utils'
import { 
    GroupKeyRequest as NewGroupKeyRequest,
    GroupKeyResponse as NewGroupKeyResponse
} from '@streamr/trackerless-network'

const serializeGroupKey = ({ id, data }: EncryptedGroupKey): string => {
    return JSON.stringify([id, binaryToHex(data)])
}

export const createSignaturePayload = (opts: {
    messageId: MessageID
    content: Uint8Array
    messageType: StreamMessageType
    signatureType: SignatureType
    encryptionType: EncryptionType
    prevMsgRef?: MessageRef
    newGroupKey?: EncryptedGroupKey
}): Uint8Array => {
    if (opts.signatureType == SignatureType.SECP256K1) {
        const header = Buffer.from(`${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}`
            + `${opts.messageId.sequenceNumber}${opts.messageId.publisherId}${opts.messageId.msgChainId}`)
        const prevMsgRef = (opts.prevMsgRef !== undefined) ? Buffer.from(`${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}`) : undefined
        // TODO maybe it would make sense to re-order the prevMsgRef to be before the content
        if (opts.messageType === StreamMessageType.MESSAGE) {
            const newGroupKeyId = opts.newGroupKey ? Buffer.from(opts.newGroupKey.id) : undefined
            return Buffer.concat([
                header,
                opts.content,
                prevMsgRef || new Uint8Array(0),
                newGroupKeyId || new Uint8Array(0),
                opts.newGroupKey?.data || new Uint8Array(0),
            ])
        } else if (opts.messageType === StreamMessageType.GROUP_KEY_REQUEST) {
            // NOTE: this conversion will be removed in the future when we migrate all usages of
            // protocol package's StreamMessage class to the trackerless-network's StreamMessage class
            const request = NewGroupKeyRequest.fromBinary(opts.content)
            return Buffer.concat([
                header,
                utf8ToBinary(request.requestId),
                request.recipientId,
                request.rsaPublicKey,
                Buffer.concat(request.groupKeyIds.map((k) => utf8ToBinary(k))),
                prevMsgRef || new Uint8Array(0)
            ])
        } else if (opts.messageType === StreamMessageType.GROUP_KEY_RESPONSE) {
            // NOTE: this conversion will be removed in the future when we migrate all usages of
            // protocol package's StreamMessage class to the trackerless-network's StreamMessage class
            const response = NewGroupKeyResponse.fromBinary(opts.content)
            return Buffer.concat([
                header,
                utf8ToBinary(response.requestId),
                response.recipientId,
                Buffer.concat(response.groupKeys.map((k) => Buffer.concat([utf8ToBinary(k.id), k.data]))),
                prevMsgRef || new Uint8Array(0)
            ])
        } else {
            throw new Error(`Assertion failed: unknown message type ${opts.messageType}`)
        }
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
