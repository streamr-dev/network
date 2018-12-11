const Int64 = require('node-int64')
const BufferMaker = require('buffermaker')
const BufferReader = require('buffer-reader')
const Protocol = require('streamr-client-protocol')
const StreamrBinaryMessage = require('./StreamrBinaryMessage')
const StreamrBinaryMessageFactory = require('./StreamrBinaryMessageFactory')

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
            this.streamrBinaryMessage = StreamrBinaryMessageFactory.fromBytes(this.streamrBinaryMessage)
        }
        return this.streamrBinaryMessage
    }

    toObject(contentAsBuffer = true) {
        // Ensure the StreamrBinaryMessage is parsed
        const m = this.getStreamrBinaryMessage()
        const obj = m.toObject(contentAsBuffer)
        obj.offset = this.offset
        obj.previousOffset = this.previousOffset
        return obj
    }

    toStreamMessage() {
        const streamrBinaryMessage = this.getStreamrBinaryMessage()

        return new Protocol.StreamMessage(
            streamrBinaryMessage.streamId,
            streamrBinaryMessage.streamPartition,
            streamrBinaryMessage.timestamp,
            streamrBinaryMessage.ttl,
            this.offset,
            this.previousOffset,
            streamrBinaryMessage.contentType,
            streamrBinaryMessage.getContentAsString(),
            streamrBinaryMessage.signatureType,
            streamrBinaryMessage.address,
            streamrBinaryMessage.signature,
        )
    }

    static fromBytes(buf) {
        const reader = new BufferReader(buf)
        const streamrBinaryMessage = StreamrBinaryMessageFactory.fromBytes(reader)

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
}

module.exports = StreamrBinaryMessageWithKafkaMetadata
