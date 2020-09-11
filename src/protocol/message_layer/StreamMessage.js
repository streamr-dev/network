import InvalidJsonError from '../../errors/InvalidJsonError'
import ValidationError from '../../errors/ValidationError'
import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import { validateIsNotEmptyString, validateIsString, validateIsType } from '../../utils/validations'

import MessageRef from './MessageRef'
import MessageID from './MessageID'
import EncryptedGroupKey from './EncryptedGroupKey'

const serializerByVersion = {}
const BYE_KEY = '_bye'
const LATEST_VERSION = 32

export default class StreamMessage {
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
    }) {
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

        if (typeof content === 'object' && contentType === StreamMessage.CONTENT_TYPES.JSON) {
            this.parsedContent = content
            this.serializedContent = JSON.stringify(content)
        } else {
            // this.parsedContent gets written lazily
            this.serializedContent = content
        }
        validateIsNotEmptyString('content', this.serializedContent)
    }

    getStreamId() {
        return this.messageId.streamId
    }

    getStreamPartition() {
        return this.messageId.streamPartition
    }

    getTimestamp() {
        return this.messageId.timestamp
    }

    getSequenceNumber() {
        return this.messageId.sequenceNumber
    }

    getPublisherId() {
        return this.messageId.publisherId
    }

    getMsgChainId() {
        return this.messageId.msgChainId
    }

    getMessageRef() {
        return new MessageRef(this.getTimestamp(), this.getSequenceNumber())
    }

    getPreviousMessageRef() {
        return this.prevMsgRef
    }

    getMessageID() {
        return this.messageId
    }

    getSerializedContent() {
        return this.serializedContent
    }

    /**
     * Lazily parses the content to JSON
     */
    getParsedContent() {
        if (!this.parsedContent) {
            // Don't try to parse encrypted messages
            if (this.messageType === StreamMessage.MESSAGE_TYPES.MESSAGE && this.encryptionType !== StreamMessage.ENCRYPTION_TYPES.NONE) {
                return this.serializedContent
            }

            if (this.contentType === StreamMessage.CONTENT_TYPES.JSON) {
                try {
                    this.parsedContent = JSON.parse(this.serializedContent)
                } catch (err) {
                    throw new InvalidJsonError(
                        this.streamId,
                        this.serializedContent,
                        err,
                        this,
                    )
                }
            } else {
                throw new Error(`Unsupported contentType for getParsedContent: ${this.contentType}`)
            }
        }
        return this.parsedContent
    }

    getContent(parsedContent = true) {
        if (parsedContent) {
            return this.getParsedContent()
        }
        return this.getSerializedContent()
    }

    getNewGroupKey() {
        return this.newGroupKey
    }

    isByeMessage() {
        return !!this.getParsedContent()[BYE_KEY]
    }

    getPayloadToSign() {
        if (this.signatureType === StreamMessage.SIGNATURE_TYPES.ETH) {
            // Nullable fields
            const prev = (this.prevMsgRef ? `${this.prevMsgRef.timestamp}${this.prevMsgRef.sequenceNumber}` : '')
            const newGroupKey = (this.newGroupKey ? this.newGroupKey.serialize() : '')

            return `${this.getStreamId()}${this.getStreamPartition()}${this.getTimestamp()}${this.messageId.sequenceNumber}`
                + `${this.getPublisherId().toLowerCase()}${this.messageId.msgChainId}${prev}${this.getSerializedContent()}${newGroupKey}`
        }

        if (this.signatureType === StreamMessage.SIGNATURE_TYPES.ETH_LEGACY) {
            // verification of messages signed by old clients
            return `${this.getStreamId()}${this.getTimestamp()}${this.getPublisherId().toLowerCase()}${this.getSerializedContent()}`
        }

        throw new Error(`Unrecognized signature type: ${this.signatureType}`)
    }

    static registerSerializer(version, serializer) {
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

    static unregisterSerializer(version) {
        delete serializerByVersion[version]
    }

    static getSerializer(version) {
        const clazz = serializerByVersion[version]
        if (!clazz) {
            throw new UnsupportedVersionError(version, `Supported versions: [${StreamMessage.getSupportedVersions()}]`)
        }
        return clazz
    }

    static getSupportedVersions() {
        return Object.keys(serializerByVersion).map((key) => parseInt(key, 10))
    }

    serialize(version = LATEST_VERSION) {
        const serializer = StreamMessage.getSerializer(version)
        return JSON.stringify(serializer.toArray(this))
    }

    /**
     * Takes a serialized representation (array or string) of a message, and returns a StreamMessage instance.
     */
    static deserialize(msg) {
        const messageArray = (typeof msg === 'string' ? JSON.parse(msg) : msg)

        /* eslint-disable prefer-destructuring */
        const messageVersion = messageArray[0]
        /* eslint-enable prefer-destructuring */

        const C = StreamMessage.getSerializer(messageVersion)
        return C.fromArray(messageArray)
    }

    static validateMessageType(messageType) {
        if (!StreamMessage.VALID_MESSAGE_TYPES.has(messageType)) {
            throw new ValidationError(`Unsupported message type: ${messageType}`)
        }
    }

    static validateContentType(contentType) {
        if (!StreamMessage.VALID_CONTENT_TYPES.has(contentType)) {
            throw new ValidationError(`Unsupported content type: ${contentType}`)
        }
    }

    static validateEncryptionType(encryptionType) {
        if (!StreamMessage.VALID_ENCRYPTIONS.has(encryptionType)) {
            throw new ValidationError(`Unsupported encryption type: ${encryptionType}`)
        }
    }

    static validateSignatureType(signatureType) {
        if (!StreamMessage.VALID_SIGNATURE_TYPES.has(signatureType)) {
            throw new ValidationError(`Unsupported signature type: ${signatureType}`)
        }
    }

    static versionSupportsEncryption(streamMessageVersion) {
        return streamMessageVersion >= 31
    }

    toObject() {
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

/* static */
StreamMessage.LATEST_VERSION = LATEST_VERSION

StreamMessage.MESSAGE_TYPES = {
    MESSAGE: 27,
    GROUP_KEY_REQUEST: 28,
    GROUP_KEY_RESPONSE: 29,
    GROUP_KEY_ANNOUNCE: 30,
    GROUP_KEY_ERROR_RESPONSE: 31,
}
StreamMessage.VALID_MESSAGE_TYPES = new Set(Object.values(StreamMessage.MESSAGE_TYPES))

StreamMessage.CONTENT_TYPES = {
    JSON: 0,
}
StreamMessage.VALID_CONTENT_TYPES = new Set(Object.values(StreamMessage.CONTENT_TYPES))

StreamMessage.SIGNATURE_TYPES = {
    NONE: 0,
    ETH_LEGACY: 1,
    ETH: 2,
}
StreamMessage.VALID_SIGNATURE_TYPES = new Set(Object.values(StreamMessage.SIGNATURE_TYPES))

StreamMessage.ENCRYPTION_TYPES = {
    NONE: 0,
    RSA: 1,
    AES: 2,
}
StreamMessage.VALID_ENCRYPTIONS = new Set(Object.values(StreamMessage.ENCRYPTION_TYPES))
