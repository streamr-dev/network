import InvalidJsonError from '../../errors/InvalidJsonError'
import StreamMessageError from '../../errors/StreamMessageError'
import ValidationError from '../../errors/ValidationError'
import { validateIsNotEmptyByteArray, validateIsString, validateIsType } from '../../utils/validations'

import MessageRef from './MessageRef'
import MessageID from './MessageID'
import EncryptedGroupKey from './EncryptedGroupKey'
import { StreamID } from '../../utils/StreamID'
import { StreamPartID } from '../../utils/StreamPartID'
import { EthereumAddress, binaryToUtf8 } from '@streamr/utils'

export enum StreamMessageType {
    MESSAGE = 27,
    GROUP_KEY_REQUEST = 28,
    GROUP_KEY_RESPONSE = 29
}

export enum ContentType {
    JSON = 0,
    BINARY = 1
}

export enum EncryptionType {
    NONE = 0,
    RSA = 1,
    AES = 2
}

export interface StreamMessageOptions {
    messageId: MessageID
    prevMsgRef?: MessageRef | null
    content: Uint8Array
    messageType?: StreamMessageType
    contentType: ContentType
    encryptionType?: EncryptionType
    groupKeyId?: string | null
    newGroupKey?: EncryptedGroupKey | null
    signature: Uint8Array
}

/**
 * Encrypted StreamMessage.
 */
export type StreamMessageAESEncrypted = StreamMessage & {
    encryptionType: EncryptionType.AES
    groupKeyId: string
}

export default class StreamMessage {
    private static VALID_MESSAGE_TYPES = new Set(Object.values(StreamMessageType))
    private static VALID_CONTENT_TYPES = new Set(Object.values(ContentType))
    private static VALID_ENCRYPTIONS = new Set(Object.values(EncryptionType))

    readonly messageId: MessageID
    readonly prevMsgRef: MessageRef | null
    readonly messageType: StreamMessageType
    readonly contentType: ContentType
    encryptionType: EncryptionType
    groupKeyId: string | null
    newGroupKey: EncryptedGroupKey | null
    signature: Uint8Array
    content: Uint8Array
    private parsedContent?: unknown

    /**
     * Create a new StreamMessage identical to the passed-in streamMessage.
     */
    clone(): StreamMessage {
        return new StreamMessage({
            messageId: this.messageId.clone(),
            prevMsgRef: this.prevMsgRef ? this.prevMsgRef.clone() : null,
            content: this.content,
            messageType: this.messageType,
            contentType: this.contentType,
            encryptionType: this.encryptionType,
            groupKeyId: this.groupKeyId,
            newGroupKey: this.newGroupKey,
            signature: this.signature,
        })
    }

    constructor({
        messageId,
        prevMsgRef = null,
        content,
        messageType = StreamMessageType.MESSAGE,
        contentType,
        encryptionType = EncryptionType.NONE,
        groupKeyId = null,
        newGroupKey = null,
        signature,
    }: StreamMessageOptions) {
        validateIsType('messageId', messageId, 'MessageID', MessageID)
        this.messageId = messageId

        validateIsType('prevMsgRef', prevMsgRef, 'MessageRef', MessageRef, true)
        this.prevMsgRef = prevMsgRef

        StreamMessage.validateMessageType(messageType)
        this.messageType = messageType

        StreamMessage.validateContentType(contentType)
        this.contentType = contentType

        StreamMessage.validateEncryptionType(encryptionType)
        this.encryptionType = encryptionType

        validateIsString('groupKeyId', groupKeyId, this.encryptionType !== EncryptionType.AES)
        this.groupKeyId = groupKeyId

        validateIsType('newGroupKey', newGroupKey, 'EncryptedGroupKey', EncryptedGroupKey, true)
        this.newGroupKey = newGroupKey

        validateIsType('signature', signature, 'Uint8Array', Uint8Array)
        this.signature = signature

        this.content = content

        validateIsNotEmptyByteArray('content', this.content)

        StreamMessage.validateSequence(this)
    }

    getStreamId(): StreamID {
        return this.messageId.streamId
    }

    getStreamPartition(): number {
        return this.messageId.streamPartition
    }

    getStreamPartID(): StreamPartID {
        return this.messageId.getStreamPartID()
    }

    getTimestamp(): number {
        return this.messageId.timestamp
    }

    getSequenceNumber(): number {
        return this.messageId.sequenceNumber
    }

    getPublisherId(): EthereumAddress {
        return this.messageId.publisherId
    }

    getMsgChainId(): string {
        return this.messageId.msgChainId
    }

    getMessageRef(): MessageRef {
        return new MessageRef(this.getTimestamp(), this.getSequenceNumber())
    }

    getPreviousMessageRef(): MessageRef | null {
        return this.prevMsgRef
    }

    getMessageID(): MessageID {
        return this.messageId
    }

    /**
     * Lazily parses the content to JSON
     */
    getParsedContent(): unknown {
        if (this.parsedContent == null) {
            // Don't try to parse encrypted or binary type messages
            if (this.contentType === ContentType.BINARY
                || (this.messageType === StreamMessageType.MESSAGE && this.encryptionType !== EncryptionType.NONE)) {
                return this.content
            }
            if (this.contentType === ContentType.JSON) {
                try {
                    this.parsedContent = JSON.parse(binaryToUtf8(this.content))
                } catch (err: any) {
                    throw new InvalidJsonError(
                        this.getStreamId(),
                        err,
                        this,
                    )
                }
            } else {
                throw new StreamMessageError(`Unsupported contentType for getParsedContent: ${this.contentType}`, this)
            }
        }
        return this.parsedContent
    }

    static isAESEncrypted(msg: StreamMessage): msg is StreamMessageAESEncrypted {
        return msg.encryptionType === EncryptionType.AES
    }

    private static validateMessageType(messageType: StreamMessageType): void {
        if (!StreamMessage.VALID_MESSAGE_TYPES.has(messageType)) {
            throw new ValidationError(`Unsupported message type: ${messageType}`)
        }
    }

    private static validateContentType(contentType: ContentType): void {
        if (!StreamMessage.VALID_CONTENT_TYPES.has(contentType)) {
            throw new ValidationError(`Unsupported content type: ${contentType}`)
        }
    }

    private static validateEncryptionType(encryptionType: EncryptionType): void {
        if (!StreamMessage.VALID_ENCRYPTIONS.has(encryptionType)) {
            throw new ValidationError(`Unsupported encryption type: ${encryptionType}`)
        }
    }

    private static validateSequence({ messageId, prevMsgRef }: { messageId: MessageID, prevMsgRef?: MessageRef | null }): void {
        if (!prevMsgRef) {
            return
        }

        const comparison = messageId.toMessageRef().compareTo(prevMsgRef)

        // cannot have same timestamp + sequence
        if (comparison === 0) {
            throw new ValidationError(
                // eslint-disable-next-line max-len
                `prevMessageRef cannot be identical to current. Current: ${JSON.stringify(messageId.toMessageRef())} Previous: ${JSON.stringify(prevMsgRef)}`
            )
        }

        // previous cannot be newer
        if (comparison < 0) {
            throw new ValidationError(
                // eslint-disable-next-line max-len
                `prevMessageRef must come before current. Current: ${JSON.stringify(messageId.toMessageRef())} Previous: ${JSON.stringify(prevMsgRef)}`
            )
        }
    }
}
