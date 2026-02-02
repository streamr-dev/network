import {
    ContentType,
    EncryptionType,
    EncryptedGroupKey,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageID as ProtoMessageID,
    MessageRef as ProtoMessageRef,
    StreamMessage as ProtoStreamMessage
} from '@streamr/trackerless-network'
import { StreamID, toUserId, toUserIdRaw } from '@streamr/utils'
import { MessageID as StreamMessageID } from './MessageID'
import { MessageRef as StreamMessageRef } from './MessageRef'
import {
    StreamMessage,
    StreamMessageType
} from './StreamMessage'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamMessageTranslator {

    static toProtobuf(msg: StreamMessage): ProtoStreamMessage {
        const messageId: ProtoMessageID = {
            timestamp: msg.getTimestamp(),
            sequenceNumber: msg.getSequenceNumber(),
            streamId: msg.getStreamId() as string,
            streamPartition: msg.getStreamPartition(),
            publisherId: toUserIdRaw(msg.getPublisherId()),
            messageChainId: msg.getMsgChainId()
        }
        let previousMessageRef: ProtoMessageRef | undefined = undefined
        if (msg.prevMsgRef) {
            previousMessageRef = {
                timestamp: msg.prevMsgRef.timestamp,
                sequenceNumber: msg.prevMsgRef.sequenceNumber
            }
        }
        let body: ProtoStreamMessage['body']
        if (msg.messageType === StreamMessageType.MESSAGE) {
            let newGroupKey: EncryptedGroupKey | undefined = undefined
            if (msg.newGroupKey) {
                newGroupKey = {
                    id: msg.newGroupKey.id,
                    data: msg.newGroupKey.data
                }
            }
            body = {
                oneofKind: 'contentMessage',
                contentMessage: {
                    content: msg.content,
                    contentType: msg.contentType,
                    encryptionType: msg.encryptionType,
                    groupKeyId: msg.groupKeyId ?? undefined,
                    newGroupKey
                }
            }
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_REQUEST) {
            body = {
                oneofKind: 'groupKeyRequest',
                groupKeyRequest: GroupKeyRequest.fromBinary(msg.content)
            }
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_RESPONSE) {
            body = {
                oneofKind: 'groupKeyResponse',
                groupKeyResponse: GroupKeyResponse.fromBinary(msg.content)
            }
        } else {
            throw new Error('invalid message type')
        }
        const translated: ProtoStreamMessage = {
            messageId,
            previousMessageRef,
            signature: msg.signature,
            signatureType: msg.signatureType,
            body
        }
        return translated
    }

    static toClientProtocol(msg: ProtoStreamMessage): StreamMessage {
        let messageType: StreamMessageType
        let content: Uint8Array
        let contentType: ContentType = ContentType.BINARY
        let encryptionType: EncryptionType = EncryptionType.NONE
        let newGroupKey: EncryptedGroupKey | undefined = undefined
        let groupKeyId: string | undefined = undefined
        if (msg.body.oneofKind === 'contentMessage') {
            messageType = StreamMessageType.MESSAGE
            content = new Uint8Array(msg.body.contentMessage.content)
            contentType = msg.body.contentMessage.contentType
            encryptionType = msg.body.contentMessage.encryptionType
            if (msg.body.contentMessage.newGroupKey) {
                newGroupKey = {
                    id: msg.body.contentMessage.newGroupKey.id,
                    data: new Uint8Array(msg.body.contentMessage.newGroupKey.data)
                }
            }
            groupKeyId = msg.body.contentMessage.groupKeyId
        } else if (msg.body.oneofKind === 'groupKeyRequest') {
            messageType = StreamMessageType.GROUP_KEY_REQUEST
            try {
                content = GroupKeyRequest.toBinary(msg.body.groupKeyRequest)
            } catch (err) {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                throw new Error(`invalid group key request: ${err}`)
            }
        } else if (msg.body.oneofKind === 'groupKeyResponse') {
            messageType = StreamMessageType.GROUP_KEY_RESPONSE
            try {
                content = GroupKeyResponse.toBinary(msg.body.groupKeyResponse)
            } catch (err) {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                throw new Error(`invalid group key response: ${err}`)
            }
        } else {
            throw new Error('invalid message type')
        }
        const messageId = new StreamMessageID(
            msg.messageId!.streamId as StreamID,
            msg.messageId!.streamPartition,
            Number(msg.messageId!.timestamp),
            msg.messageId!.sequenceNumber,
            toUserId(msg.messageId!.publisherId),
            msg.messageId!.messageChainId
        )
        let prevMsgRef: StreamMessageRef | undefined = undefined
        if (msg.previousMessageRef) {
            prevMsgRef = new StreamMessageRef(Number(msg.previousMessageRef.timestamp), msg.previousMessageRef.sequenceNumber)
        }
        const translated = new StreamMessage({
            messageId,
            prevMsgRef,
            messageType,
            content,
            contentType,
            signature: new Uint8Array(msg.signature),
            signatureType: msg.signatureType,
            encryptionType,
            groupKeyId,
            newGroupKey
        })
        return translated
    }
}
