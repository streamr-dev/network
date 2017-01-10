const Int64 = require('node-int64')
const BufferMaker = require('buffermaker')
const BufferReader = require('buffer-reader')

const VERSION = 28; //0x1C
const CONTENT_TYPE_JSON = 27; //0x1B

function StreamrBinaryMessage(streamId, streamPartition, timestamp, ttl, contentType, content) {
	this.version = VERSION
	this.streamId = streamId
	this.streamPartition = streamPartition
	this.timestamp = timestamp
	this.ttl = ttl
	this.contentType = contentType
	this.content = content
}

/*static*/ StreamrBinaryMessage.CONTENT_TYPE_JSON = CONTENT_TYPE_JSON

StreamrBinaryMessage.prototype.toBytes = function(bufferMaker) {
	if (this.contentType === CONTENT_TYPE_JSON) {
		return this.toBufferMaker(new BufferMaker()).make();
	} else {
		throw "I don't know how to encode content type "+this.contentType
	}
}

StreamrBinaryMessage.prototype.toBufferMaker = function(bufferMaker) {
	var streamIdBuf = new BufferMaker().string(this.streamId).make()
	var contentBuf = Buffer.isBuffer(this.content) ? this.content : new BufferMaker().string(JSON.stringify(this.content)).make()

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

/*static*/ StreamrBinaryMessage.fromBytes = function(buf, skipContentParsing) {
	var reader = buf instanceof BufferReader ? buf : new BufferReader(buf)
	var version = reader.nextInt8()

	if (version===28) {
		this.version = 28
		var ts = new Int64(reader.nextBuffer(8)).valueOf()
		var ttl = reader.nextInt32BE()
		var streamIdLength = reader.nextUInt8()
		var streamId = reader.nextString(streamIdLength, 'UTF-8')
		var streamPartition = reader.nextUInt8()
		var contentType = reader.nextInt8()
		var contentLength = reader.nextInt32BE()
		var content

		if (skipContentParsing) {
			content = reader.nextBuffer(contentLength)
		} else if (contentType === 27) {
			// JSON content type
			content = JSON.parse(reader.nextString(contentLength, 'UTF-8'))
		} else {
			throw "decode: Invalid content type: "+contentType
		}

		return new StreamrBinaryMessage(streamId, streamPartition, ts, ttl, contentType, content)
	} else {
		throw "Unknown version: "+version
	}
}

module.exports = StreamrBinaryMessage
