import InvalidJsonError from '../../errors/InvalidJsonError'
import ValidationError from '../../errors/ValidationError'
import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import { validateIsNotEmptyString, validateIsString, validateIsType } from '../../utils/validations'

import MessageRef from './MessageRef'
import MessageID from './MessageID'

const serializerByVersion = {}
const BYE_KEY = '_bye'
const LATEST_VERSION = 31

export default class StreamMessage {
    constructor(
        messageId,
        prevMsgRef = null,
        content,
        contentType = StreamMessage.CONTENT_TYPES.MESSAGE,
        encryptionType = StreamMessage.ENCRYPTION_TYPES.NONE,
        signatureType = StreamMessage.SIGNATURE_TYPES.NONE,
        signature = null,
    ) {
        validateIsType('messageId', messageId, 'MessageID', MessageID)
        this.messageId = messageId

        validateIsType('prevMsgRef', prevMsgRef, 'MessageRef', MessageRef, true)
        this.prevMsgRef = prevMsgRef

        StreamMessage.validateContentType(contentType)
        this.contentType = contentType

        StreamMessage.validateEncryptionType(encryptionType)
        this.encryptionType = encryptionType

        StreamMessage.validateSignatureType(signatureType)
        this.signatureType = signatureType

        validateIsString('signature', signature, true)
        this.signature = signature

        validateIsNotEmptyString('content', content)
        this.serializedContent = content // parsed lazily and cached as this.parsedContent

        // Parse and validate content of message types related to key exchange (non-message types)
        if (contentType !== StreamMessage.CONTENT_TYPES.MESSAGE) {
            StreamMessage.validateContent(this.getParsedContent(), this.contentType)
        }
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
            if (this.contentType === StreamMessage.CONTENT_TYPES.MESSAGE && this.encryptionType !== StreamMessage.ENCRYPTION_TYPES.NONE) {
                return this.serializedContent
            }

            try {
                const parsed = JSON.parse(this.serializedContent)
                this.parsedContent = parsed
            } catch (err) {
                throw new InvalidJsonError(
                    this.streamId,
                    this.serializedContent,
                    err,
                    this,
                )
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

    isByeMessage() {
        return !!this.getParsedContent()[BYE_KEY]
    }

    getPayloadToSign() {
        if (this.signatureType === StreamMessage.SIGNATURE_TYPES.ETH) {
            let prev = ''
            if (this.prevMsgRef) {
                prev = `${this.prevMsgRef.timestamp}${this.prevMsgRef.sequenceNumber}`
            }
            return `${this.getStreamId()}${this.getStreamPartition()}${this.getTimestamp()}${this.messageId.sequenceNumber}`
                + `${this.getPublisherId().toLowerCase()}${this.messageId.msgChainId}${prev}${this.getSerializedContent()}`
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
            throw new UnsupportedVersionError(version, `Supported versions: [${Object.keys(serializerByVersion)}]`)
        }
        return clazz
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

    static validateContentType(contentType) {
        if (!StreamMessage.VALID_CONTENTS.has(contentType)) {
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

    static validateContent(content, contentType) {
        if (contentType === StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST) {
            if (!content.publicKey) {
                throw new Error(`Content of type ${contentType} must contain a 'publicKey' field.`)
            } else if (!content.streamId) {
                throw new Error(`Content of type ${contentType} must contain a 'streamId' field.`)
            } else if (content.range && !content.range.start && !content.range.end) {
                throw new Error(`Field 'range' in content of type ${contentType} must contain fields 'start' and 'end'.`)
            }
        } else if (contentType === StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE) {
            if (!content.streamId) {
                throw new Error(`Content of type ${contentType} must contain a 'streamId' field.`)
            } else if (!content.keys) {
                throw new Error(`Content of type ${contentType} must contain a 'keys' field.`)
            }
            content.keys.forEach((keyResponse) => {
                if (!keyResponse.groupKey || !keyResponse.start) {
                    throw new Error(`Each element in field 'keys' of content of type ${contentType} must contain 'groupKey' and 'start' fields.`)
                }
            })
        } else if (contentType === StreamMessage.CONTENT_TYPES.GROUP_KEY_RESET_SIMPLE) {
            if (!content.streamId || !content.groupKey || !content.start) {
                throw new Error(`Content of type ${contentType} must contain 'streamId', 'groupKey' and 'start' fields.`)
            }
        } else if (contentType === StreamMessage.CONTENT_TYPES.ERROR_MSG) {
            if (!content.code) {
                throw new Error(`Content of type ${contentType} must contain 'code' and 'message' fields.`)
            }
            if (!content.message) {
                throw new Error(`Content of type ${contentType} must contain 'code' and 'message' fields.`)
            }
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
            contentType: this.contentType,
            encryptionType: this.encryptionType,
            content: this.getParsedContent(),
            signatureType: this.signatureType,
            signature: this.signature,
        }
    }
}

/* static */
StreamMessage.LATEST_VERSION = LATEST_VERSION

StreamMessage.CONTENT_TYPES = {
    MESSAGE: 27,
    GROUP_KEY_REQUEST: 28,
    GROUP_KEY_RESPONSE_SIMPLE: 29,
    GROUP_KEY_RESET_SIMPLE: 30,
    ERROR_MSG: 31,
}
StreamMessage.VALID_CONTENTS = new Set(Object.values(StreamMessage.CONTENT_TYPES))

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
    NEW_KEY_AND_AES: 3,
}

StreamMessage.VALID_ENCRYPTIONS = new Set(Object.values(StreamMessage.ENCRYPTION_TYPES))
