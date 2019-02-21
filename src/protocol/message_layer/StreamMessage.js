import InvalidJsonError from '../../errors/InvalidJsonError'

const BYE_KEY = '_bye'
const LATEST_VERSION = 30

export default class StreamMessage {
    constructor(version, streamId, contentType, content) {
        if (new.target === StreamMessage) {
            throw new TypeError('StreamMessage is abstract.')
        }
        this.version = version
        this.streamId = streamId
        this.contentType = contentType
        if (!content) {
            throw new Error('Content cannot be empty.')
        }
        this.serializedContent = this.serializeContent(content)
        this.parsedContent = this.parseContent(content)
    }

    getStreamId() {
        return this.streamId
    }
    /* eslint-disable class-methods-use-this */
    getStreamPartition() {
        throw new Error('getStreamPartition must be implemented')
    }

    getTimestamp() {
        throw new Error('getTimestamp must be implemented')
    }

    getPublisherId() {
        throw new Error('getPublisherId must be implemented')
    }

    getMessageRef() {
        throw new Error('getMessageRef must be implemented')
    }
    /* eslint-enable class-methods-use-this */

    serializeContent(content) {
        if (typeof content === 'string') {
            return content
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON && typeof content === 'object') {
            return JSON.stringify(content)
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON) {
            throw new Error('Stream payloads can only be objects!')
        } else {
            throw new Error(`Unsupported content type: ${this.contentType}`)
        }
    }

    parseContent(content) {
        if (this.contentType === StreamMessage.CONTENT_TYPES.JSON && typeof content === 'object') {
            return content
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON && typeof content === 'string') {
            try {
                return JSON.parse(content)
            } catch (err) {
                throw new InvalidJsonError(
                    this.streamId,
                    content,
                    err,
                    this,
                )
            }
        } else {
            throw new Error(`Unsupported content type: ${this.contentType}`)
        }
    }

    getSerializedContent() {
        return this.serializedContent
    }

    getParsedContent() {
        return this.parsedContent
    }

    getContent(parsedContent = false) {
        if (parsedContent) {
            return this.getParsedContent()
        }
        return this.getSerializedContent()
    }

    isByeMessage() {
        return !!this.getParsedContent()[BYE_KEY]
    }

    static create(messageIdArgsArray, prevMessageRefArgsArray, contentType, content, signatureType, signature) {
        const C = StreamMessage.latestClass
        return new C(messageIdArgsArray, prevMessageRefArgsArray, contentType, content, signatureType, signature)
    }
}
/* static */ StreamMessage.LATEST_VERSION = LATEST_VERSION

StreamMessage.CONTENT_TYPES = {
    JSON: 27,
}

StreamMessage.SIGNATURE_TYPES = {
    NONE: 0,
    ETH_LEGACY: 1,
    ETH: 2,
}
