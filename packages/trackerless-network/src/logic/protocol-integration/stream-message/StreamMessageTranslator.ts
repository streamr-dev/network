import {
    MessageID as OldMessageID,
    StreamMessage as OldStreamMessage,
    StreamMessageType as OldStreamMessageType,
    MessageRef as OldMessageRef,
    EncryptedGroupKey as OldEncryptedGroupKey,
    StreamID,
    EncryptionType as OldEncryptionType,
    ContentType as OldContentType,
    serializeGroupKeyRequest as serializeOldGroupKeyRequest,
    serializeGroupKeyResponse as serializeOldGroupKeyResponse,
    deserializeGroupKeyRequest as deserializeOldGroupKeyRequest,
    deserializeGroupKeyResponse as deserializeOldGroupKeyResponse
} from '@streamr/protocol'
import {
    ContentType,
    GroupKey,
    EncryptionType,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageRef,
    StreamMessage,
    StreamMessageType,
    MessageID
} from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { toEthereumAddress, binaryToHex, hexToBinary } from '@streamr/utils'
import { GroupKeyRequestTranslator } from './GroupKeyRequestTranslator'
import { GroupKeyResponseTranslator } from './GroupKeyResponseTranslator'

const oldToNewEncryptionType = (type: OldEncryptionType): EncryptionType => {
    if (type === OldEncryptionType.AES) {
        return EncryptionType.AES
    }
    return EncryptionType.NONE
}

const newToOldEncryptionType = (type: EncryptionType): OldEncryptionType => {
    if (type === EncryptionType.AES) {
        return OldEncryptionType.AES
    }
    return OldEncryptionType.NONE
}

const oldToNewContentType = (type: OldContentType): ContentType => {
    if (type === OldContentType.JSON) {
        return ContentType.JSON
    }
    return ContentType.BINARY
}

const newToOldContentType = (type: ContentType): OldContentType => {
    if (type === ContentType.JSON) {
        return OldContentType.JSON
    }
    return OldContentType.BINARY
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamMessageTranslator {

    static toProtobuf(msg: OldStreamMessage): StreamMessage {
        let content: Uint8Array
        let messageType: StreamMessageType
        if (msg.messageType === OldStreamMessageType.MESSAGE) {
            content = msg.content
            messageType = StreamMessageType.MESSAGE
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_REQUEST) {
            content = GroupKeyRequest.toBinary(
                GroupKeyRequestTranslator.toProtobuf(deserializeOldGroupKeyRequest(msg.content))
            )
            messageType = StreamMessageType.GROUP_KEY_REQUEST
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_RESPONSE) {
            content = GroupKeyResponse.toBinary(
                GroupKeyResponseTranslator.toProtobuf(deserializeOldGroupKeyResponse(msg.content))
            )
            messageType = StreamMessageType.GROUP_KEY_RESPONSE
        } else {
            throw new Error('invalid message type')
        }
        const messageId: MessageID = {
            timestamp: msg.getTimestamp(),
            sequenceNumber: msg.getSequenceNumber(),
            streamId: msg.getStreamId() as string,
            streamPartition: msg.getStreamPartition(),
            publisherId: hexToBinary(msg.getPublisherId()),
            messageChainId: msg.getMsgChainId()
        }
        let previousMessageRef: MessageRef | undefined = undefined
        if (msg.prevMsgRef) {
            previousMessageRef = {
                timestamp: msg.prevMsgRef!.timestamp,
                sequenceNumber: msg.prevMsgRef!.sequenceNumber,
            }
        }
        let newGroupKey: GroupKey | undefined = undefined
        if (msg.newGroupKey) {
            newGroupKey = {
                id: msg.newGroupKey!.groupKeyId,
                data: msg.newGroupKey!.data
            }
        }
        const translated: StreamMessage = {
            messageId,
            previousMessageRef,
            content,
            messageType,
            contentType: oldToNewContentType(msg.contentType),
            encryptionType: oldToNewEncryptionType(msg.encryptionType),
            groupKeyId: msg.groupKeyId ?? undefined,
            newGroupKey,
            signature: msg.signature
        }
        return translated
    }

    static toClientProtocol(msg: StreamMessage): OldStreamMessage {
        let content: Uint8Array
        let messageType: OldStreamMessageType
        if (msg.messageType === StreamMessageType.MESSAGE) {
            messageType = OldStreamMessageType.MESSAGE
            content = msg.content
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_REQUEST) {
            messageType = OldStreamMessageType.GROUP_KEY_REQUEST
            try {
                const parsedRequest = GroupKeyRequest.fromBinary(msg.content)
                const oldGroupKeyRequest = GroupKeyRequestTranslator.toClientProtocol(parsedRequest)
                content = serializeOldGroupKeyRequest(oldGroupKeyRequest)
            } catch (err) {
                throw new Error(`invalid group key request: ${err}`)
            }
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_RESPONSE) {
            messageType = OldStreamMessageType.GROUP_KEY_RESPONSE
            try {
                const parsedResponse = GroupKeyResponse.fromBinary(msg.content)
                const oldGroupKeyResponse = GroupKeyResponseTranslator.toClientProtocol(parsedResponse)
                content = serializeOldGroupKeyResponse(oldGroupKeyResponse)
            } catch (err) {
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
            toEthereumAddress(binaryToHex(msg.messageId!.publisherId, true)),
            msg.messageId!.messageChainId
        )
        let prevMsgRef: OldMessageRef | undefined = undefined
        if (msg.previousMessageRef) {
            prevMsgRef = new OldMessageRef(Number(msg.previousMessageRef.timestamp), msg.previousMessageRef.sequenceNumber)
        }
        let newGroupKey: OldEncryptedGroupKey | undefined = undefined
        if (msg.newGroupKey) {
            newGroupKey = new OldEncryptedGroupKey(
                msg.newGroupKey.id,
                msg.newGroupKey.data,
            )
        }
        const translated = new OldStreamMessage({
            messageId,
            prevMsgRef,
            content,
            messageType,
            contentType: newToOldContentType(msg.contentType),
            encryptionType: newToOldEncryptionType(msg.encryptionType),
            groupKeyId: msg.groupKeyId,
            newGroupKey,
            signature: msg.signature
        })
        return translated
    }
}
