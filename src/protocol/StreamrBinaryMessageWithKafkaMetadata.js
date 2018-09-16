const Int64 = require('node-int64')
const BufferMaker = require('buffermaker')
const BufferReader = require('buffer-reader')
const StreamrBinaryMessage = require('./StreamrBinaryMessage')

const VERSION = 0

class StreamrBinaryMessageWithKafkaMetadata {
    constructor(streamrBinaryMessage, offset, previousOffset, kafkaPartition) {
        this.version = VERSION
        this.streamrBinaryMessage = streamrBinaryMessage
        this.offset = offset
        this.previousOffset = previousOffset
        this.kafkaPartition = kafkaPartition
    }

    toBytes() {
        return this.toBufferMaker(new BufferMaker())
            .make()
    }

    toBufferMaker(bufferMaker) {
        // First add all of the original msg. It can be a StreamrBinaryMessage or binary buffer
        if (this.streamrBinaryMessage instanceof StreamrBinaryMessage) {
            this.streamrBinaryMessage.toBufferMaker(bufferMaker)
        } else {
            bufferMaker.string(this.streamrBinaryMessage)
        }

        return bufferMaker
            .Int8(this.version)
            .Int64BE(this.offset)
            .Int64BE(this.previousOffset != null ? this.previousOffset : -1)
            .Int32BE(this.kafkaPartition)
    }

    getStreamrBinaryMessage() {
        if (!(this.streamrBinaryMessage instanceof StreamrBinaryMessage)) {
            this.streamrBinaryMessage = StreamrBinaryMessage.fromBytes(this.streamrBinaryMessage)
        }
        return this.streamrBinaryMessage
    }

    toArray(contentAsBuffer = true) {
        // Ensure the StreamrBinaryMessage is parsed
        const m = this.getStreamrBinaryMessage(contentAsBuffer)
        return [
            m.version,
            m.streamId,
            m.streamPartition,
            m.timestamp,
            m.ttl,
            this.offset,
            this.previousOffset,
            m.contentType,
            contentAsBuffer ? m.getContentBuffer()
                .toString('utf8') : m.getContentParsed(),
        ]
    }

    toObject(contentAsBuffer = true) {
        // Ensure the StreamrBinaryMessage is parsed
        const m = this.getStreamrBinaryMessage(contentAsBuffer)
        return {
            version: m.version,
            streamId: m.streamId,
            partition: m.streamPartition,
            timestamp: m.timestamp,
            ttl: m.ttl,
            offset: this.offset,
            previousOffset: this.previousOffset,
            contentType: m.contentType,
            content: contentAsBuffer ? m.getContentBuffer()
                .toString('utf8') : m.getContentParsed(),
        }
    }
}

/* static */ StreamrBinaryMessageWithKafkaMetadata.fromBytes = (buf) => {
    const reader = new BufferReader(buf)
    const streamrBinaryMessage = StreamrBinaryMessage.fromBytes(reader)

    // Read the rest of the buffer, containing this class's fields
    const version = reader.nextInt8()
    if (version === 0) {
        const offset = new Int64(reader.nextBuffer(8)).valueOf()
        const previousOffset = new Int64(reader.nextBuffer(8)).valueOf()
        const kafkaPartition = reader.nextInt32BE()

        return new StreamrBinaryMessageWithKafkaMetadata(
            streamrBinaryMessage, offset,
            previousOffset >= 0 ? previousOffset : undefined, kafkaPartition,
        )
    }

    throw new Error(`Unknown version: ${version}`)
}

module.exports = StreamrBinaryMessageWithKafkaMetadata
