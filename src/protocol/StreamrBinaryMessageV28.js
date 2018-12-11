const Int64 = require('node-int64')
const BufferMaker = require('buffermaker')
const StreamrBinaryMessage = require('./StreamrBinaryMessage')

function ensureBuffer(content) {
    if (Buffer.isBuffer(content)) {
        return content
    } else if (typeof content === 'string') {
        return Buffer.from(content, 'utf8')
    }

    throw new Error(`Unable to convert content to a Buffer! Type is: ${typeof content}`)
}

class StreamrBinaryMessageV28 extends StreamrBinaryMessage {
    constructor(streamId, streamPartition, timestamp, ttl, contentType, content) {
        super()
        this.version = StreamrBinaryMessage.VERSION
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.timestamp = (timestamp instanceof Date ? timestamp.getTime() : timestamp)
        this.ttl = ttl
        this.contentType = contentType
        this.content = ensureBuffer(content)
    }

    toBytes() {
        if (this.contentType === StreamrBinaryMessage.CONTENT_TYPE_JSON) {
            return this.toBufferMaker(new BufferMaker()).make()
        }
        throw new Error(`I don't know how to encode content type ${this.contentType}`)
    }

    toBufferMaker(bufferMaker) {
        const streamIdBuf = new BufferMaker().string(this.streamId).make()
        const contentBuf = ensureBuffer(this.content)

        return bufferMaker
        // byte 0: version (1 byte)
            .Int8(this.version)
            // 1: timestamp (8)
            .Int64BE(this.timestamp)
            // 9: ttl (4)
            .Int32BE(this.ttl)
            // 13: streamIdLength (1)
            .UInt8(streamIdBuf.length)
            // 14: streamId (variable length)
            .string(this.streamId)
            // 14 + streamIdLength: streamPartition (1)
            .UInt8(this.streamPartition)
            // 15 + streamIdLength: contentType (1)
            .Int8(this.contentType)
            // 16 + streamIdLength: contentLength (4)
            .Int32BE(contentBuf.length)
            // 20 + streamIdLength: content (variable length)
            .string(contentBuf)
    }

    getContentBuffer() {
        return this.content
    }

    getContentAsString() {
        return this.getContentBuffer().toString('utf8')
    }

    getContentLength() {
        return this.getContentBuffer().length
    }

    getContentParsed() {
        if (!this.contentParsed) {
            if (this.contentType === 27) {
                // JSON content type
                this.contentParsed = JSON.parse(this.content.toString('utf8'))
            } else {
                throw new Error(`decode: Invalid content type: ${this.contentType}`)
            }
        }

        return this.contentParsed
    }

    toObject(contentAsBuffer) {
        return {
            version: StreamrBinaryMessage.VERSION,
            streamId: this.streamId,
            partition: this.streamPartition,
            timestamp: this.timestamp,
            ttl: this.ttl,
            contentType: this.contentType,
            content: contentAsBuffer ? this.getContentBuffer()
                .toString('utf8') : this.getContentParsed(),
        }
    }

    static fromBytes(reader) {
        const ts = new Int64(reader.nextBuffer(8)).valueOf()
        const ttl = reader.nextInt32BE()
        const streamIdLength = reader.nextUInt8()
        const streamId = reader.nextString(streamIdLength, 'UTF-8')
        const streamPartition = reader.nextUInt8()
        const contentType = reader.nextInt8()
        const contentLength = reader.nextInt32BE()
        const content = reader.nextBuffer(contentLength)
        return new StreamrBinaryMessageV28(streamId, streamPartition, ts, ttl, contentType, content)
    }
}

module.exports = StreamrBinaryMessageV28
