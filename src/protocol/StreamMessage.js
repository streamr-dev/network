import InvalidJsonError from '../errors/InvalidJsonError'
import UnsupportedVersionError from '../errors/UnsupportedVersionError'

const BYE_KEY = '_bye'

class StreamMessage {
    constructor(streamId, streamPartition, timestamp, ttl, offset, previousOffset, contentType, content, signatureType, publisherAddress, signature) {
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.timestamp = timestamp
        this.ttl = ttl
        this.offset = offset
        this.previousOffset = previousOffset
        this.contentType = contentType
        this.content = content
        this.signatureType = signatureType
        this.publisherAddress = publisherAddress
        this.signature = signature
    }

    getParsedContent() {
        if (this.parsedContent !== undefined) {
            return this.parsedContent
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON && typeof this.content === 'object') {
            this.parsedContent = this.content
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON && typeof this.content === 'string') {
            try {
                this.parsedContent = JSON.parse(this.content)
            } catch (err) {
                throw new InvalidJsonError(
                    this.streamId,
                    this.content,
                    err,
                    this,
                )
            }
        } else {
            throw new Error(`Unsupported content type: ${this.contentType}`)
        }

        return this.parsedContent
    }

    getSerializedContent() {
        if (typeof this.content === 'string') {
            return this.content
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON && typeof this.content === 'object') {
            return JSON.stringify(this.content)
        } else if (this.contentType === StreamMessage.CONTENT_TYPES.JSON) {
            throw new Error('Stream payloads can only be objects!')
        } else {
            throw new Error(`Unsupported content type: ${this.contentType}`)
        }
    }

    toObject(version = 28, parsedContent = false, compact = true) {
        if (version === 28 || version === 29) {
            if (compact) {
                const arr = [
                    version,
                    this.streamId,
                    this.streamPartition,
                    this.timestamp,
                    this.ttl,
                    this.offset,
                    this.previousOffset,
                    this.contentType,
                    (parsedContent ? this.getParsedContent() : this.getSerializedContent()),
                ]
                if (version === 29) {
                    arr.push(
                        this.signatureType,
                        this.publisherAddress,
                        this.signature,
                    )
                }
                return arr
            }
            const obj = {
                streamId: this.streamId,
                streamPartition: this.streamPartition,
                timestamp: this.timestamp,
                ttl: this.ttl,
                offset: this.offset,
                previousOffset: this.previousOffset,
                contentType: this.contentType,
                content: (parsedContent ? this.getParsedContent() : this.getSerializedContent()),
            }
            if (version === 29) {
                obj.signatureType = this.signatureType
                obj.publisherAddress = this.publisherAddress
                obj.signature = this.signature
            }
            return obj
        }
        throw new UnsupportedVersionError(version, 'Supported versions: [28, 29]')
    }

    serialize(version = 28) {
        return JSON.stringify(this.toObject(version))
    }

    static deserialize(stringOrArray, parseContent = true) {
        const message = (typeof stringOrArray === 'string' ? JSON.parse(stringOrArray) : stringOrArray)

        /**
         * Version 28: [version, streamId, streamPartition, timestamp, ttl, offset, previousOffset, contentType, content]
         * Version 29: [version, streamId, streamPartition, timestamp, ttl, offset, previousOffset, contentType, content,
         * signatureType, address, signature]
         */
        if (message[0] === 28 || message[0] === 29) {
            const result = new this.prototype.constructor(...message.slice(1))

            // Ensure that the content parses
            if (parseContent) {
                result.getParsedContent()
            }
            return result
        }
        throw new UnsupportedVersionError(message[0], 'Supported versions: [28, 29]')
    }

    isByeMessage() {
        return !!this.getParsedContent()[BYE_KEY]
    }
}

StreamMessage.CONTENT_TYPES = {
    JSON: 27,
}

module.exports = StreamMessage
