import { StreamID, StreamPartID, UserID, binaryToUtf8 } from '@streamr/utils'
import { StreamrClientError } from '../StreamrClientError'
import { EncryptedGroupKey } from './EncryptedGroupKey'
import { MessageID } from './MessageID'
import { MessageRef } from './MessageRef'
import { ValidationError } from './ValidationError'
import { validateIsDefined } from './validations'

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
    AES = 2
}

export enum SignatureType {
    LEGACY_SECP256K1, // Brubeck payload signed with secp256k1 curve
    SECP256K1, // Streamr 1.0 payload signed with secp256k1 curve
    ERC_1271 // ERC-1271 with secp256k1 curve implementation
}

export interface StreamMessageOptions {
    messageId: MessageID
    prevMsgRef?: MessageRef
    messageType?: StreamMessageType
    content: Uint8Array
    contentType: ContentType
    signature: Uint8Array
    signatureType: SignatureType
    encryptionType: EncryptionType
    groupKeyId?: string
    newGroupKey?: EncryptedGroupKey
}

/**
 * Encrypted StreamMessage.
 */
export type StreamMessageAESEncrypted = StreamMessage & {
    encryptionType: EncryptionType.AES
    groupKeyId: string
}

/**
 * Validates that messageId is strictly after prevMsgRef in time.
 */
function validateSequence(messageId: MessageID, prevMsgRef: MessageRef | undefined): void {
    if (prevMsgRef === undefined) {
        return
    }

    const comparison = messageId.toMessageRef().compareTo(prevMsgRef)

    if (comparison === 0) {
        throw new ValidationError(
            // eslint-disable-next-line max-len
            `prevMessageRef cannot be identical to current. Current: ${JSON.stringify(messageId.toMessageRef())} Previous: ${JSON.stringify(prevMsgRef)}`
        )
    }
    if (comparison < 0) {
        throw new ValidationError(
            `prevMessageRef must come before current. Current: ${JSON.stringify(messageId.toMessageRef())} Previous: ${JSON.stringify(prevMsgRef)}`
        )
    }
}

export class StreamMessage implements StreamMessageOptions {
    readonly messageId: MessageID
    readonly prevMsgRef?: MessageRef
    readonly messageType: StreamMessageType
    readonly content: Uint8Array
    readonly contentType: ContentType
    readonly signature: Uint8Array
    readonly signatureType: SignatureType
    readonly encryptionType: EncryptionType
    readonly groupKeyId?: string
    readonly newGroupKey?: EncryptedGroupKey

    constructor({
        messageId,
        prevMsgRef,
        messageType = StreamMessageType.MESSAGE,
        content,
        contentType,
        signature,
        signatureType,
        encryptionType,
        groupKeyId,
        newGroupKey
    }: StreamMessageOptions) {
        validateSequence(messageId, prevMsgRef)
        if (encryptionType === EncryptionType.AES) {
            validateIsDefined('groupKeyId', groupKeyId)
        }

        this.messageId = messageId
        this.prevMsgRef = prevMsgRef
        this.messageType = messageType
        this.contentType = contentType
        this.encryptionType = encryptionType
        this.groupKeyId = groupKeyId
        this.newGroupKey = newGroupKey
        this.signature = signature
        this.signatureType = signatureType
        this.content = content
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

    getPublisherId(): UserID {
        return this.messageId.publisherId
    }

    getMsgChainId(): string {
        return this.messageId.msgChainId
    }

    getMessageRef(): MessageRef {
        return new MessageRef(this.getTimestamp(), this.getSequenceNumber())
    }

    // TODO: consider replacing later half of type with a "JSON type" from a ts-toolbelt or type-fest or ts-essentials
    getParsedContent(): Uint8Array | Record<string, unknown> | unknown[] {
        if (this.encryptionType !== EncryptionType.NONE || this.contentType === ContentType.BINARY) {
            return this.content
        } else if (this.contentType === ContentType.JSON) {
            try {
                return JSON.parse(binaryToUtf8(this.content))
            } catch (err: any) {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                throw new StreamrClientError(`Unable to parse JSON: ${err}`, 'INVALID_MESSAGE_CONTENT', this)
            }
        } else {
            throw new StreamrClientError(`Unknown content type: ${this.contentType}`, 'ASSERTION_FAILED', this)
        }
    }

    static isAESEncrypted(msg: StreamMessage): msg is StreamMessageAESEncrypted {
        return msg.encryptionType === EncryptionType.AES
    }
}
