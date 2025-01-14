import {
    GroupKeyRequest as NewGroupKeyRequest,
    GroupKeyResponse as NewGroupKeyResponse
} from '@streamr/trackerless-network'
import { utf8ToBinary } from '@streamr/utils'
import { EncryptedGroupKey } from '../protocol/EncryptedGroupKey'
import { MessageID } from '../protocol/MessageID'
import { MessageRef } from '../protocol/MessageRef'
import { StreamMessageType } from '../protocol/StreamMessage'

export const createSignaturePayload = (opts: {
    messageId: MessageID
    content: Uint8Array
    messageType: StreamMessageType
    prevMsgRef?: MessageRef
    newGroupKey?: EncryptedGroupKey
}): Uint8Array | never => {
    const header = Buffer.concat([
        Buffer.from(
            `${opts.messageId.streamId}${opts.messageId.streamPartition}${opts.messageId.timestamp}` +
                `${opts.messageId.sequenceNumber}${opts.messageId.publisherId}${opts.messageId.msgChainId}`
        ),
        opts.prevMsgRef !== undefined
            ? Buffer.from(`${opts.prevMsgRef.timestamp}${opts.prevMsgRef.sequenceNumber}`)
            : new Uint8Array(0)
    ])
    if (opts.messageType === StreamMessageType.MESSAGE) {
        const newGroupKeyId = opts.newGroupKey ? Buffer.from(opts.newGroupKey.id) : undefined
        return Buffer.concat([
            header,
            opts.content,
            newGroupKeyId ?? new Uint8Array(0),
            opts.newGroupKey?.data ?? new Uint8Array(0)
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
