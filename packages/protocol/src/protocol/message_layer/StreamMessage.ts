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

export const VERSION = 32

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

    messageId: MessageID
    prevMsgRef: MessageRef | null
    messageType: StreamMessageType
    contentType: ContentType
    encryptionType: EncryptionType
    groupKeyId: string | null
    newGroupKey: EncryptedGroupKey | null
    signature: Uint8Array
    private parsedContent?: unknown
    serializedContent: Uint8Array

    /**
     * Create a new StreamMessage identical to the passed-in streamMessage.
     */
    clone(): StreamMessage {
        const content = this.getSerializedContent()
        return new StreamMessage({
            messageId: this.messageId.clone(),
            prevMsgRef: this.prevMsgRef ? this.prevMsgRef.clone() : null,
            content,
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

        this.serializedContent = content

        validateIsNotEmptyByteArray('content', this.serializedContent)

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

    getSerializedContent(): Uint8Array {
        return this.serializedContent
    }

    /**
     * Lazily parses the content to JSON
     */
    getParsedContent(): unknown {
        if (this.parsedContent == null) {
            // Don't try to parse encrypted or binary type messages
            if (this.contentType === ContentType.BINARY
                || (this.messageType === StreamMessageType.MESSAGE && this.encryptionType !== EncryptionType.NONE)) {
                return this.serializedContent
            }
            if (this.contentType === ContentType.JSON) {
                try {
                    this.parsedContent = JSON.parse(binaryToUtf8(this.serializedContent))
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

    getContent(): Uint8Array
    getContent(parsedContent: false): Uint8Array
    getContent(parsedContent: true): unknown
    getContent(parsedContent = true): Uint8Array | unknown {
        if (parsedContent) {
            return this.getParsedContent()
        }
        return this.getSerializedContent()
    }

    getNewGroupKey(): EncryptedGroupKey | null {
        return this.newGroupKey
    }

    static validateMessageType(messageType: StreamMessageType): void {
        if (!StreamMessage.VALID_MESSAGE_TYPES.has(messageType)) {
            throw new ValidationError(`Unsupported message type: ${messageType}`)
        }
    }

    static validateContentType(contentType: ContentType): void {
        if (!StreamMessage.VALID_CONTENT_TYPES.has(contentType)) {
            throw new ValidationError(`Unsupported content type: ${contentType}`)
        }
    }

    static validateEncryptionType(encryptionType: EncryptionType): void {
        if (!StreamMessage.VALID_ENCRYPTIONS.has(encryptionType)) {
            throw new ValidationError(`Unsupported encryption type: ${encryptionType}`)
        }
    }

    static validateSequence({ messageId, prevMsgRef }: { messageId: MessageID, prevMsgRef?: MessageRef | null }): void {
        if (!prevMsgRef) {
            return
        }

        const comparison = messageId.toMessageRef().compareTo(prevMsgRef)

        // cannot have same timestamp + sequence
        if (comparison === 0) {
            throw new ValidationError(
                `prevMessageRef cannot be identical to current. Current: ${messageId.toMessageRef().toArray()} Previous: ${prevMsgRef.toArray()}`
            )
        }

        // previous cannot be newer
        if (comparison < 0) {
            throw new ValidationError(
                `prevMessageRef must come before current. Current: ${messageId.toMessageRef().toArray()} Previous: ${prevMsgRef.toArray()}`
            )
        }
    }

    static isAESEncrypted(msg: StreamMessage): msg is StreamMessageAESEncrypted {
        return msg.encryptionType === EncryptionType.AES
    }
}
