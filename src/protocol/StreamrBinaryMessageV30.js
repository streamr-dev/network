const Int64 = require('node-int64')
const BufferMaker = require('buffermaker')
const Protocol = require('streamr-client-protocol')
const StreamrBinaryMessage = require('./StreamrBinaryMessage')

const VERSION = 30 // 0x1E

const SIGNATURE_TYPE_NONE = 0
const SIGNATURE_TYPE_ETH = 1

function ensureBuffer(content) {
    if (Buffer.isBuffer(content)) {
        return content
    } else if (typeof content === 'string') {
        return Buffer.from(content, 'utf8')
    }

    throw new Error(`Unable to convert content to a Buffer! Type is: ${typeof content}`)
}

function hexToBytes(buf, hex) {
    const hexToParse = hex.startsWith('0x') ? hex.substr(2) : hex
    const b = Buffer.from(hexToParse, 'hex')
    return buf.string(b)
}

function bytesToHex(bytes) {
    return `0x${bytes.toString('hex')}`
}

class StreamrBinaryMessageV30 extends StreamrBinaryMessage {
    constructor(
        streamId, streamPartition, timestamp, sequenceNumber, publisherId, prevTimestamp, prevSequenceNumber,
        ttl, contentType, content, signatureType, signature,
    ) {
        super(VERSION, streamId, streamPartition, timestamp, ttl, contentType, content)
        this.sequenceNumber = sequenceNumber
        this.publisherId = publisherId
        this.prevTimestamp = prevTimestamp
        this.prevSequenceNumber = prevSequenceNumber
        this.signatureType = signatureType
        this.signature = signature
    }

    toStreamMessage() {
        const messageIdArgs = [this.streamId, this.streamPartition, this.timestamp, this.sequenceNumber, this.publisherId]
        const prevMessageRefArgs = [this.prevTimestamp, this.prevSequenceNumber]
        return new Protocol.MessageLayer.StreamMessageV30(
            messageIdArgs,
            prevMessageRefArgs,
            this.ttl,
            this.contentType,
            this.getContentAsString(),
            this.signatureType,
            this.signature,
        )
    }

    toBufferMaker(bufferMaker) {
        const streamIdBuf = new BufferMaker().string(this.streamId).make()
        const contentBuf = ensureBuffer(this.content)

        let buf = bufferMaker
            // byte 0: version (1 byte)
            .Int8(this.version)
            // 1: streamIdLength (1)
            .UInt8(streamIdBuf.length)
            // 2: streamId (variable length)
            .string(this.streamId)
            // 2 + streamIdLength: streamPartition (1)
            .UInt8(this.streamPartition)
            // 3 + streamIdLength: timestamp (8)
            .Int64BE(this.timestamp)
            // 11 + streamIdLength: sequenceNumber (4)
            .Int32BE(this.sequenceNumber)
            // 15 + streamIdLength: publisherId (20)
        buf = hexToBytes(buf, this.publisherId)
            // 35 + streamIdLength: prevTimestamp (8)
            .Int64BE(this.prevTimestamp)
            // 43 + streamIdLength: prevSequenceNumber (4)
            .Int32BE(this.prevSequenceNumber)
            // 47 + streamIdLength: ttl (4)
            .Int32BE(this.ttl)
            // 51 + streamIdLength: contentType (1)
            .Int8(this.contentType)
            // 52 + streamIdLength: contentLength (4)
            .Int32BE(contentBuf.length)
            // 56 + streamIdLength: content (variable length)
            .string(contentBuf)
            // 56 + streamIdLength + contentLength: signatureType (1)
            .Int8(this.signatureType)
        if (this.signatureType === SIGNATURE_TYPE_ETH) {
            // 57 + streamIdLength + contentLength: signature (65)
            buf = hexToBytes(buf, this.signature)
        }
        return buf
    }

    toObject(contentAsBuffer) {
        const obj = super.toObject(contentAsBuffer)
        obj.sequenceNumber = this.sequenceNumber
        obj.publisherId = this.publisherId
        obj.signatureType = this.signatureType
        obj.signature = this.signature
        return obj
    }

    static fromBytes(reader) {
        const streamIdLength = reader.nextUInt8()
        const streamId = reader.nextString(streamIdLength, 'UTF-8')
        const streamPartition = reader.nextUInt8()
        const timestamp = new Int64(reader.nextBuffer(8)).valueOf()
        const sequenceNumber = reader.nextInt32BE()
        const publisherId = bytesToHex(reader.nextBuffer(20)) // an Ethereum address is 20 bytes.
        const prevTimestamp = new Int64(reader.nextBuffer(8)).valueOf()
        const prevSequenceNumber = reader.nextInt32BE()
        const ttl = reader.nextInt32BE()
        const contentType = reader.nextInt8()
        const contentLength = reader.nextInt32BE()
        const content = reader.nextBuffer(contentLength)
        const signatureType = reader.nextInt8()
        let signature
        if (signatureType === SIGNATURE_TYPE_ETH) {
            signature = bytesToHex(reader.nextBuffer(65)) // an Ethereum signature is 65 bytes.
        } else if (signatureType !== SIGNATURE_TYPE_NONE) {
            throw new Error(`Unknown signature type: ${signatureType}`)
        }
        return new StreamrBinaryMessageV30(
            streamId,
            streamPartition,
            timestamp,
            sequenceNumber,
            publisherId,
            prevTimestamp === 0 ? null : prevTimestamp,
            prevSequenceNumber,
            ttl,
            contentType,
            content,
            signatureType,
            signature,
        )
    }
}

/* static */ StreamrBinaryMessageV30.VERSION = VERSION

module.exports = StreamrBinaryMessageV30
