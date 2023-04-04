import InvalidJsonError from '../../errors/InvalidJsonError'
import StreamMessageError from '../../errors/StreamMessageError'
import ValidationError from '../../errors/ValidationError'
import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import { validateIsNotEmptyString, validateIsString, validateIsType } from '../../utils/validations'

import MessageRef from './MessageRef'
import MessageID from './MessageID'
import EncryptedGroupKey from './EncryptedGroupKey'
import { Serializer } from '../../Serializer'
import { StreamID } from '../../utils/StreamID'
import { StreamPartID } from "../../utils/StreamPartID"
import { EthereumAddress } from '@streamr/utils'

const serializerByVersion: Record<string, Serializer<StreamMessage>> = {}
const LATEST_VERSION = 32

export enum StreamMessageType {
    MESSAGE = 27,
    GROUP_KEY_REQUEST = 28,
    GROUP_KEY_RESPONSE = 29
}

export enum ContentType {
    JSON = 0
}

export enum EncryptionType {
    NONE = 0,
    RSA = 1,
    AES = 2
}

export interface StreamMessageOptions<T> {
    messageId: MessageID
    prevMsgRef?: MessageRef | null
    content: T | string
    messageType?: StreamMessageType
    contentType?: ContentType
    encryptionType?: EncryptionType
    groupKeyId?: string | null
    newGroupKey?: EncryptedGroupKey | null
    signature: string
}

/**
 * Encrypted StreamMessage.
 * @internal
 */
export type StreamMessageAESEncrypted<T> = StreamMessage<T> & {
    encryptionType: EncryptionType.AES
    groupKeyId: string
    parsedContent: never
}

export default class StreamMessage<T = unknown> {
    static LATEST_VERSION = LATEST_VERSION

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
    signature: string
    parsedContent?: T
    serializedContent: string

    /**
     * Create a new StreamMessage identical to the passed-in streamMessage.
     */
    clone(): StreamMessage<T> {
        const content = this.encryptionType === EncryptionType.NONE
            ? this.getParsedContent()
            : this.getSerializedContent()

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
        contentType = ContentType.JSON,
        encryptionType = EncryptionType.NONE,
        groupKeyId = null,
        newGroupKey = null,
        signature,
    }: StreamMessageOptions<T>) {
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

        validateIsString('groupKeyId', groupKeyId, true)
        this.groupKeyId = groupKeyId

        validateIsType('newGroupKey', newGroupKey, 'EncryptedGroupKey', EncryptedGroupKey, true)
        this.newGroupKey = newGroupKey

        validateIsString('signature', signature, false)
        this.signature = signature

        if (typeof content === 'string') {
            // this.parsedContent gets written lazily
            this.serializedContent = content
        } else {
            this.parsedContent = content
            this.serializedContent = JSON.stringify(content)
        }

        validateIsNotEmptyString('content', this.serializedContent)

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

    getSerializedContent(): string {
        return this.serializedContent
    }

    /**
     * Lazily parses the content to JSON
     */
    getParsedContent(): T {
        if (this.parsedContent == null) {
            // Don't try to parse encrypted messages
            if (this.messageType === StreamMessageType.MESSAGE && this.encryptionType !== EncryptionType.NONE) {
                // @ts-expect-error need type narrowing for encrypted vs unencrypted
                return this.serializedContent
            }

            if (this.contentType === ContentType.JSON) {
                try {
                    this.parsedContent = JSON.parse(this.serializedContent!)
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

        // should be expected type by here
        return this.parsedContent as T
    }

    getContent(): string
    getContent(parsedContent: false): string
    getContent(parsedContent: true): T
    getContent(parsedContent = true): string | T {
        if (parsedContent) {
            return this.getParsedContent()
        }
        return this.getSerializedContent()
    }

    getNewGroupKey(): EncryptedGroupKey | null {
        return this.newGroupKey
    }

    /** @internal */
    static registerSerializer(version: number, serializer: Serializer<StreamMessage<unknown>>): void {
        // Check the serializer interface
        if (!serializer.fromArray) {
            throw new Error(`Serializer ${JSON.stringify(serializer)} doesn't implement a method fromArray!`)
        }
        if (!serializer.toArray) {
            throw new Error(`Serializer ${JSON.stringify(serializer)} doesn't implement a method toArray!`)
        }

        if (serializerByVersion[version] !== undefined) {
            throw new Error(`Serializer for version ${version} is already registered: ${
                JSON.stringify(serializerByVersion[version])
            }`)
        }
        serializerByVersion[version] = serializer
    }

    /** @internal */
    static unregisterSerializer(version: number): void {
        delete serializerByVersion[version]
    }

    /** @internal */
    static getSerializer(version: number): Serializer<StreamMessage<unknown>> {
        const clazz = serializerByVersion[version]
        if (!clazz) {
            throw new UnsupportedVersionError(version, `Supported versions: [${StreamMessage.getSupportedVersions()}]`)
        }
        return clazz
    }

    static getSupportedVersions(): number[] {
        return Object.keys(serializerByVersion).map((key) => parseInt(key, 10))
    }

    serialize(version = LATEST_VERSION): string {
        const serializer = StreamMessage.getSerializer(version)
        return JSON.stringify(serializer.toArray(this))
    }

    /**
     * Takes a serialized representation (array or string) of a message, and returns a StreamMessage instance.
     */
    static deserialize(msg: any[] | string): StreamMessage {
        const messageArray = (typeof msg === 'string' ? JSON.parse(msg) : msg)

        const messageVersion = messageArray[0]

        const C = StreamMessage.getSerializer(messageVersion)
        return C.fromArray(messageArray)
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

    static versionSupportsEncryption(streamMessageVersion: number): boolean {
        return streamMessageVersion >= 31
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

    static isAESEncrypted<T = unknown>(msg: StreamMessage<T>): msg is StreamMessageAESEncrypted<T> {
        return (msg.encryptionType === EncryptionType.AES)
    }
}
