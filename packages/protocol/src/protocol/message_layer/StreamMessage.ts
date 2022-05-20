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

const serializerByVersion: {[version: string]: Serializer<StreamMessage> } = {}
const BYE_KEY = '_bye'
const LATEST_VERSION = 32

export enum StreamMessageType {
    MESSAGE = 27,
    GROUP_KEY_REQUEST = 28,
    GROUP_KEY_RESPONSE = 29,
    GROUP_KEY_ANNOUNCE = 30,
    GROUP_KEY_ERROR_RESPONSE = 31
}

export enum ContentType {
    JSON = 0
}

export enum SignatureType {
    NONE = 0,
    ETH_LEGACY = 1,
    ETH = 2
}

export enum EncryptionType {
    NONE = 0,
    RSA = 1,
    AES = 2
}

export type StreamMessageOptions<T> = {
    messageId: MessageID
    prevMsgRef?: MessageRef | null
    content: T | string
    messageType?: StreamMessageType
    contentType?: ContentType
    encryptionType?: EncryptionType
    groupKeyId?: string | null
    newGroupKey?: EncryptedGroupKey | null
    signatureType?: SignatureType
    signature?: string | null
}

export interface ObjectType<T> { 
    streamId: string
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    publisherId: string
    msgChainId: string
    messageType: StreamMessageType
    contentType: ContentType
    encryptionType: EncryptionType
    groupKeyId: string|null
    content: string|T
    signatureType: SignatureType;
    signature: string|null
}
/**
 * Any object that contains a toStreamMessage interface.
 * e.g. GroupKeyMessage
 */
export type StreamMessageContainer<T = unknown> = {
    toStreamMessage: (messageId: MessageID, prevMsgRef: MessageRef | null) => StreamMessage<T>
}

/**
 * Unsigned StreamMessage.
 */
export type StreamMessageUnsigned<T> = StreamMessage<T> & {
    signatureType: SignatureType.NONE
    signature: '' | null
}

/**
 * Signed StreamMessage.
 */
export type StreamMessageSigned<T> = StreamMessage<T> & {
    signatureType: SignatureType.ETH | SignatureType.ETH_LEGACY
    signature: string
}

/**
 *  Encrypted StreamMessage.
 */
export type StreamMessageEncrypted<T> = StreamMessage<T> & {
    encryptionType: EncryptionType.RSA | EncryptionType.AES
    groupKeyId: string
    parsedContent: never
}
/**
 * Unencrypted StreamMessage.
 */
export type StreamMessageUnencrypted<T> = StreamMessage<T> & {
    encryptionType: EncryptionType.NONE
}

export default class StreamMessage<T = unknown> {
    static LATEST_VERSION = LATEST_VERSION

    // TODO can we remove these static field and use the enum object directly?
    static MESSAGE_TYPES = StreamMessageType

    static VALID_MESSAGE_TYPES = new Set(Object.values(StreamMessage.MESSAGE_TYPES))

    static CONTENT_TYPES = ContentType

    static VALID_CONTENT_TYPES = new Set(Object.values(StreamMessage.CONTENT_TYPES))

    static SIGNATURE_TYPES = SignatureType

    static VALID_SIGNATURE_TYPES = new Set(Object.values(StreamMessage.SIGNATURE_TYPES))

    static ENCRYPTION_TYPES = EncryptionType

    static VALID_ENCRYPTIONS = new Set(Object.values(StreamMessage.ENCRYPTION_TYPES))

    messageId: MessageID
    prevMsgRef: MessageRef | null
    messageType: StreamMessageType
    contentType: ContentType
    encryptionType: EncryptionType
    groupKeyId: string | null
    newGroupKey: EncryptedGroupKey | null
    signatureType: SignatureType
    signature: string | null
    parsedContent?: T
    serializedContent: string

    /**
     * Create a new StreamMessage identical to the passed-in streamMessage.
     */
    clone(): StreamMessage<T> {
        const content = this.encryptionType === StreamMessage.ENCRYPTION_TYPES.NONE
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
            signatureType: this.signatureType,
            signature: this.signature,
        })
    }

    constructor({
        messageId,
        prevMsgRef = null,
        content,
        messageType = StreamMessage.MESSAGE_TYPES.MESSAGE,
        contentType = StreamMessage.CONTENT_TYPES.JSON,
        encryptionType = StreamMessage.ENCRYPTION_TYPES.NONE,
        groupKeyId = null,
        newGroupKey = null,
        signatureType = StreamMessage.SIGNATURE_TYPES.NONE,
        signature = null,
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

        StreamMessage.validateSignatureType(signatureType)
        this.signatureType = signatureType

        validateIsString('signature', signature, true)
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

    getPublisherId(): string {
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
            if (this.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE && this.encryptionType !== StreamMessage.ENCRYPTION_TYPES.NONE) {
                // @ts-expect-error need type narrowing for encrypted vs unencrypted
                return this.serializedContent
            }

            if (this.contentType === StreamMessage.CONTENT_TYPES.JSON) {
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

    isByeMessage(): boolean {
        return !!((this.getParsedContent() as any)[BYE_KEY])
    }

    /**
     * Gets appropriate payload to sign for this signature type.
     * Optionally sets new signature type at same time, which allows typesafe
     * signing without messages needing to be in a partially signed state.
     * e.g.
     * ```
     * const signedMessage: StreamMessageSigned = Object.assign(unsigedMessage, {
     *     signature: unsigedMessage.getPayloadToSign(SignatureType.ETH),
     * })
     * ```
     */
    getPayloadToSign(newSignatureType?: SignatureType): string {
        if (newSignatureType != null) {
            StreamMessage.validateSignatureType(newSignatureType)
            this.signatureType = newSignatureType
        }

        const { signatureType } = this
        if (signatureType === StreamMessage.SIGNATURE_TYPES.ETH) {
            // Nullable fields
            const prev = (this.prevMsgRef ? `${this.prevMsgRef.timestamp}${this.prevMsgRef.sequenceNumber}` : '')
            const newGroupKey = (this.newGroupKey ? this.newGroupKey.serialize() : '')

            return `${this.getStreamId()}${this.getStreamPartition()}${this.getTimestamp()}${this.messageId.sequenceNumber}`
                + `${this.getPublisherId().toLowerCase()}${this.messageId.msgChainId}${prev}${this.getSerializedContent()}${newGroupKey}`
        }

        if (signatureType === StreamMessage.SIGNATURE_TYPES.ETH_LEGACY) {
            // verification of messages signed by old clients
            return `${this.getStreamId()}${this.getTimestamp()}${this.getPublisherId().toLowerCase()}${this.getSerializedContent()}`
        }

        throw new ValidationError(`Unrecognized signature type: ${signatureType}`)
    }

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

    static unregisterSerializer(version: number): void {
        delete serializerByVersion[version]
    }

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

    static validateSignatureType(signatureType: SignatureType): void {
        if (!StreamMessage.VALID_SIGNATURE_TYPES.has(signatureType)) {
            throw new ValidationError(`Unsupported signature type: ${signatureType}`)
        }
    }

    static versionSupportsEncryption(streamMessageVersion: number): boolean {
        return streamMessageVersion >= 31
    }

    static validateSequence({ messageId, prevMsgRef }: { messageId: MessageID, prevMsgRef?: MessageRef | null}): void {
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

    static isUnsigned<T = unknown>(msg: StreamMessage<T>): msg is StreamMessageUnsigned<T> {
        return !this.isSigned(msg)
    }

    static isSigned<T = unknown>(msg: StreamMessage<T>): msg is StreamMessageSigned<T> {
        return !!(msg && msg.signature && msg.signatureType !== SignatureType.NONE)
    }

    static isEncrypted<T = unknown>(msg: StreamMessage<T>): msg is StreamMessageEncrypted<T> {
        return !!(msg && msg.encryptionType !== EncryptionType.NONE)
    }

    static isUnencrypted<T = unknown>(msg: StreamMessage<T>): msg is StreamMessageUnencrypted<T> {
        return !this.isEncrypted(msg)
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    static isStreamMessageContainer<T = unknown>(content: any): content is StreamMessageContainer<T> {
        return !!(content && typeof content === 'object' && 'toStreamMessage' in content && typeof content.toStreamMessage === 'function')
    }

    toObject(): ObjectType<T> {
        return {
            streamId: this.getStreamId(),
            streamPartition: this.getStreamPartition(),
            timestamp: this.getTimestamp(),
            sequenceNumber: this.getSequenceNumber(),
            publisherId: this.getPublisherId(),
            msgChainId: this.getMsgChainId(),
            messageType: this.messageType,
            contentType: this.contentType,
            encryptionType: this.encryptionType,
            groupKeyId: this.groupKeyId,
            content: (this.encryptionType === StreamMessage.ENCRYPTION_TYPES.NONE ? this.getParsedContent() : this.getSerializedContent()),
            signatureType: this.signatureType,
            signature: this.signature,
        }
    }
}
