import {
    ContentType as NewContentType,
    EncryptionType as NewEncryptionType,
    GroupKey as NewGroupKey,
    GroupKeyRequest as NewGroupKeyRequest,
    GroupKeyResponse as NewGroupKeyResponse,
    MessageID as NewMessageID,
    MessageRef as NewMessageRef,
    SignatureType as NewSignatureType,
    StreamMessage as NewStreamMessage
} from '@streamr/trackerless-network'
import { StreamID, toUserId, toUserIdRaw } from '@streamr/utils'
import { EncryptedGroupKey as OldEncryptedGroupKey } from './EncryptedGroupKey'
import { MessageID as OldMessageID } from './MessageID'
import { MessageRef as OldMessageRef } from './MessageRef'
import {
    ContentType as OldContentType,
    EncryptionType as OldEncryptionType,
    SignatureType as OldSignatureType,
    StreamMessage as OldStreamMessage,
    StreamMessageType as OldStreamMessageType
} from './StreamMessage'

const oldToNewEncryptionType = (type: OldEncryptionType): NewEncryptionType => {
    if (type === OldEncryptionType.AES) {
        return NewEncryptionType.AES
    }
    return NewEncryptionType.NONE
}

const newToOldEncryptionType = (type: NewEncryptionType): OldEncryptionType => {
    if (type === NewEncryptionType.AES) {
        return OldEncryptionType.AES
    }
    return OldEncryptionType.NONE
}

const oldToNewContentType = (type: OldContentType): NewContentType => {
    if (type === OldContentType.JSON) {
        return NewContentType.JSON
    }
    return NewContentType.BINARY
}

const newToOldContentType = (type: NewContentType): OldContentType => {
    if (type === NewContentType.JSON) {
        return OldContentType.JSON
    }
    return OldContentType.BINARY
}

const oldToNewSignatureType = (type: OldSignatureType): NewSignatureType => {
    if (type === OldSignatureType.LEGACY_SECP256K1) {
        return NewSignatureType.LEGACY_SECP256K1
    }
    if (type === OldSignatureType.ERC_1271) {
        return NewSignatureType.ERC_1271
    }
    return NewSignatureType.SECP256K1
}

const newToOldSignatureType = (type: NewSignatureType): OldSignatureType => {
    if (type === NewSignatureType.LEGACY_SECP256K1) {
        return OldSignatureType.LEGACY_SECP256K1
    }
    if (type === NewSignatureType.ERC_1271) {
        return OldSignatureType.ERC_1271
    }
    return OldSignatureType.SECP256K1
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamMessageTranslator {
    static toProtobuf(msg: OldStreamMessage): NewStreamMessage {
        const messageId: NewMessageID = {
            timestamp: msg.getTimestamp(),
            sequenceNumber: msg.getSequenceNumber(),
            streamId: msg.getStreamId() as string,
            streamPartition: msg.getStreamPartition(),
            publisherId: toUserIdRaw(msg.getPublisherId()),
            messageChainId: msg.getMsgChainId()
        }
        let previousMessageRef: NewMessageRef | undefined = undefined
        if (msg.prevMsgRef) {
            previousMessageRef = {
                timestamp: msg.prevMsgRef.timestamp,
                sequenceNumber: msg.prevMsgRef.sequenceNumber
            }
        }
        let body: NewStreamMessage['body']
        if (msg.messageType === OldStreamMessageType.MESSAGE) {
            let newGroupKey: NewGroupKey | undefined = undefined
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
                    contentType: oldToNewContentType(msg.contentType),
                    encryptionType: oldToNewEncryptionType(msg.encryptionType),
                    groupKeyId: msg.groupKeyId ?? undefined,
                    newGroupKey
                }
            }
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_REQUEST) {
            body = {
                oneofKind: 'groupKeyRequest',
                groupKeyRequest: NewGroupKeyRequest.fromBinary(msg.content)
            }
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_RESPONSE) {
            body = {
                oneofKind: 'groupKeyResponse',
                groupKeyResponse: NewGroupKeyResponse.fromBinary(msg.content)
            }
        } else {
            throw new Error('invalid message type')
        }
        const translated: NewStreamMessage = {
            messageId,
            previousMessageRef,
            signature: msg.signature,
            signatureType: oldToNewSignatureType(msg.signatureType),
            body
        }
        return translated
    }

    static toClientProtocol(msg: NewStreamMessage): OldStreamMessage {
        let messageType: OldStreamMessageType
        let content: Uint8Array
        let contentType: OldContentType = OldContentType.BINARY
        let encryptionType: OldEncryptionType = OldEncryptionType.NONE
        let newGroupKey: OldEncryptedGroupKey | undefined = undefined
        let groupKeyId: string | undefined = undefined
        if (msg.body.oneofKind === 'contentMessage') {
            messageType = OldStreamMessageType.MESSAGE
            content = msg.body.contentMessage.content
            contentType = newToOldContentType(msg.body.contentMessage.contentType)
            encryptionType = newToOldEncryptionType(msg.body.contentMessage.encryptionType)
            if (msg.body.contentMessage.newGroupKey) {
                newGroupKey = new OldEncryptedGroupKey(
                    msg.body.contentMessage.newGroupKey.id,
                    msg.body.contentMessage.newGroupKey.data
                )
            }
            groupKeyId = msg.body.contentMessage.groupKeyId
        } else if (msg.body.oneofKind === 'groupKeyRequest') {
            messageType = OldStreamMessageType.GROUP_KEY_REQUEST
            try {
                content = NewGroupKeyRequest.toBinary(msg.body.groupKeyRequest)
            } catch (err) {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                throw new Error(`invalid group key request: ${err}`)
            }
        } else if (msg.body.oneofKind === 'groupKeyResponse') {
            messageType = OldStreamMessageType.GROUP_KEY_RESPONSE
            try {
                content = NewGroupKeyResponse.toBinary(msg.body.groupKeyResponse)
            } catch (err) {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                throw new Error(`invalid group key response: ${err}`)
            }
        } else {
            throw new Error('invalid message type')
        }
        const messageId = new OldMessageID(
            msg.messageId!.streamId as StreamID,
            msg.messageId!.streamPartition,
            Number(msg.messageId!.timestamp),
            msg.messageId!.sequenceNumber,
            toUserId(msg.messageId!.publisherId),
            msg.messageId!.messageChainId
        )
        let prevMsgRef: OldMessageRef | undefined = undefined
        if (msg.previousMessageRef) {
            prevMsgRef = new OldMessageRef(
                Number(msg.previousMessageRef.timestamp),
                msg.previousMessageRef.sequenceNumber
            )
        }
        const translated = new OldStreamMessage({
            messageId,
            prevMsgRef,
            messageType,
            content,
            contentType,
            signature: msg.signature,
            signatureType: newToOldSignatureType(msg.signatureType),
            encryptionType,
            groupKeyId,
            newGroupKey
        })
        return translated
    }
}
