import {
    EncryptedGroupKey,
    GroupKeyRequest as NewGroupKeyRequest,
    GroupKeyResponse as NewGroupKeyResponse
} from '@streamr/trackerless-network'
import { StreamID, UserID, utf8ToBinary } from '@streamr/utils'
import { StreamMessageType } from '../protocol/StreamMessage'

/**
 * Plain data for message ID - accepts class instances or plain objects with the same properties.
 */
export interface MessageIdLike {
    streamId: StreamID
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId: UserID
    msgChainId: string
}

/**
 * Plain data for message reference - accepts class instances or plain objects with the same properties.
 */
export interface MessageRefLike {
    timestamp: number
    sequenceNumber: number
}

/**
 * Input data for creating a signature payload.
 */
export interface SignaturePayloadInput {
    messageId: MessageIdLike
    content: Uint8Array
    messageType: StreamMessageType
    prevMsgRef?: MessageRefLike
    newGroupKey?: EncryptedGroupKey
}

export const createSignaturePayload = (opts: SignaturePayloadInput): Uint8Array | never => {
    const header = Buffer.concat([
        Buffer.from(`${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}`
                + `${opts.messageId.sequenceNumber}${opts.messageId.publisherId}${opts.messageId.msgChainId}`),
        (opts.prevMsgRef !== undefined) ? Buffer.from(`${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}`) : new Uint8Array(0)
    ])
    if (opts.messageType === StreamMessageType.MESSAGE) {
        const newGroupKeyId = opts.newGroupKey ? Buffer.from(opts.newGroupKey.id) : undefined
        return Buffer.concat([
            header,
            opts.content,
            newGroupKeyId ?? new Uint8Array(0),
            opts.newGroupKey?.data ?? new Uint8Array(0),
        ])
    } else if (opts.messageType === StreamMessageType.GROUP_KEY_REQUEST) {
        // NOTE: this conversion will be removed in the future when we migrate all usages of
        // protocol package's StreamMessage class to the trackerless-network's StreamMessage class
        const request = NewGroupKeyRequest.fromBinary(opts.content)
        return Buffer.concat([
            header,
            utf8ToBinary(request.requestId),
            request.recipientId,
            request.publicKey,
            Buffer.concat(request.groupKeyIds.map((k) => utf8ToBinary(k)))
        ])
    } else if (opts.messageType === StreamMessageType.GROUP_KEY_RESPONSE) {
        // NOTE: this conversion will be removed in the future when we migrate all usages of
        // protocol package's StreamMessage class to the trackerless-network's StreamMessage class
        const response = NewGroupKeyResponse.fromBinary(opts.content)
        return Buffer.concat([
            header,
            utf8ToBinary(response.requestId),
            response.recipientId,
            Buffer.concat(response.groupKeys.map((k) => Buffer.concat([utf8ToBinary(k.id), k.data])))
        ])
    } else {
        throw new Error(`Assertion failed: unknown message type ${opts.messageType}`)
    }
}
