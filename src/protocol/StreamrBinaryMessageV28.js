const Int64 = require('node-int64')
const Protocol = require('streamr-client-protocol')
const StreamrBinaryMessage = require('./StreamrBinaryMessage')

const VERSION = 28 // 0x1C

class StreamrBinaryMessageV28 extends StreamrBinaryMessage {
    constructor(streamId, streamPartition, timestamp, ttl, contentType, content) {
        super(VERSION, streamId, streamPartition, timestamp, ttl, contentType, content)
    }

    toStreamMessage(offset, previousOffset) {
        return new Protocol.MessageLayer.StreamMessageV28(
            this.streamId,
            this.streamPartition,
            this.timestamp,
            this.ttl,
            offset,
            previousOffset,
            this.contentType,
            this.getContentAsString(),
        )
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

/* static */ StreamrBinaryMessageV28.VERSION = VERSION

module.exports = StreamrBinaryMessageV28
