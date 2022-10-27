import {
    MessageID,
    StreamMessage as OldStreamMessage,
    StreamMessageType as OldStreamMessageType,
    MessageRef as OldMessageRef,
    GroupKeyRequest as OldGroupKeyRequest,
    GroupKeyResponse as OldGroupKeyResponse,
    EncryptedGroupKey as OldEncryptedGroupKey,
    StreamID,
} from 'streamr-client-protocol'
import {
    ContentMessage,
    EncryptedGroupKey,
    GroupKeyRequest,
    GroupKeyResponse,
    MessageRef,
    StreamMessage,
    StreamMessageType
} from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { GroupKeyRequestTranslator } from './GroupKeyRequestTranslator'
import { ContentMessageTranslator } from './ContentMessageTranslator'
import { GroupKeyResponseTranslator } from './GroupKeyResponseTranslator'
import { EthereumAddress } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class StreamMessageTranslator {

    static toProtobuf(msg: OldStreamMessage): StreamMessage {
        let content: Uint8Array
        let contentType: StreamMessageType
        if (msg.messageType === OldStreamMessageType.MESSAGE) {
            content = ContentMessage.toBinary(ContentMessageTranslator.toProtobuf(msg.serializedContent))
            contentType = StreamMessageType.MESSAGE

        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_REQUEST) {
            const translatedRequest = GroupKeyRequestTranslator.toProtobuf(msg.getParsedContent() as OldGroupKeyRequest)
            content = GroupKeyRequest.toBinary(translatedRequest)
            contentType = StreamMessageType.GROUP_KEY_REQUEST
        } else if (msg.messageType === OldStreamMessageType.GROUP_KEY_RESPONSE) {
            const translatedResponse = GroupKeyResponseTranslator.toProtobuf(msg.getParsedContent() as OldGroupKeyResponse)
            content = GroupKeyResponse.toBinary(translatedResponse)
            contentType = StreamMessageType.GROUP_KEY_RESPONSE
        } else {
            throw new Error('invalid message type')
        }

        const messageRef: MessageRef = {
            timestamp: BigInt(msg.getTimestamp()),
            sequenceNumber: msg.getSequenceNumber(),
            streamId: msg.getStreamId() as string,
            streamPartition: msg.getStreamPartition(),
            publisherId: msg.getPublisherId(),
            messageChainId: msg.getMsgChainId()
        }

        let previousMessageRef: MessageRef | undefined = undefined
        if (msg.getPreviousMessageRef()) {
            previousMessageRef = {
                timestamp: BigInt(msg.getPreviousMessageRef()!.timestamp),
                sequenceNumber: msg.getPreviousMessageRef()!.sequenceNumber,
                streamId: msg.getStreamId() as string,
                streamPartition: msg.getStreamPartition(),
                publisherId: msg.getPublisherId(),
                messageChainId: msg.getMsgChainId()
            }
        }

        let newGroupKey: EncryptedGroupKey | undefined = undefined
        if (msg.getNewGroupKey()) {
            newGroupKey = {
                encryptedGroupKeyHex: msg.getNewGroupKey()!.encryptedGroupKeyHex,
                groupKeyId: msg.getNewGroupKey()!.groupKeyId,
                serialized: msg.getNewGroupKey()!.serialized || undefined
            }
        }

        const translated: StreamMessage = {
            content: content,
            encryptionType: msg.encryptionType,
            messageRef: messageRef,
            previousMessageRef,
            messageType: contentType,
            signature: msg.signature,
            groupKeyId: msg.groupKeyId || undefined,
            newGroupKey,
        }
        return translated
    }

    static toClientProtocol<T>(msg: StreamMessage): OldStreamMessage<T> {
        let content: string
        let contentType: OldStreamMessageType
        if (msg.messageType === StreamMessageType.MESSAGE) {
            contentType = OldStreamMessageType.MESSAGE
            content = ContentMessageTranslator.toClientProtocol(ContentMessage.fromBinary(msg.content))
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_REQUEST) {
            contentType = OldStreamMessageType.GROUP_KEY_REQUEST
            content = JSON.stringify(GroupKeyRequestTranslator.toClientProtocol(GroupKeyRequest.fromBinary(msg.content)))
        } else if (msg.messageType === StreamMessageType.GROUP_KEY_RESPONSE) {
            contentType = OldStreamMessageType.GROUP_KEY_RESPONSE
            content = JSON.stringify(GroupKeyResponseTranslator.toClientProtocol(GroupKeyResponse.fromBinary(msg.content)))

        } else {
            throw new Error('invalid message type')
        }

        const messageId = new MessageID(
            msg.messageRef!.streamId as StreamID,
            msg.messageRef!.streamPartition,
            Number(msg.messageRef!.timestamp),
            msg.messageRef!.sequenceNumber,
            msg.messageRef!.publisherId as EthereumAddress,
            msg.messageRef!.messageChainId
        )

        let prevMsgRef: OldMessageRef | undefined = undefined
        if (msg.previousMessageRef) {
            prevMsgRef = new OldMessageRef(Number(msg.previousMessageRef!.timestamp), msg.previousMessageRef!.sequenceNumber)
        }

        let newGroupKey: OldEncryptedGroupKey | undefined = undefined
        if (msg.newGroupKey) {
            newGroupKey = new OldEncryptedGroupKey(
                msg.newGroupKey!.groupKeyId,
                msg.newGroupKey!.encryptedGroupKeyHex,
                msg.newGroupKey!.serialized
            )
        }

        const translated = new OldStreamMessage<T>({
            signature: msg.signature,
            newGroupKey,
            groupKeyId: msg.groupKeyId,
            content,
            messageType: contentType,
            encryptionType: msg.encryptionType,
            messageId,
            prevMsgRef
        })

        return translated
    }
}
