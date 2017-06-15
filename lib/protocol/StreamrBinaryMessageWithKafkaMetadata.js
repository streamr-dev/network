const Int64 = require('node-int64')
const BufferMaker = require('buffermaker')
const BufferReader = require('buffer-reader')
const StreamrBinaryMessage = require('./StreamrBinaryMessage')

const VERSION = 0

function StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, offset, previousOffset, kafkaPartition) {
	this.version = VERSION
	this.streamrBinaryMessage = streamrBinaryMessage
	this.offset = offset
	this.previousOffset = previousOffset
	this.kafkaPartition = kafkaPartition
}

StreamrBinaryMessageWithKafkaMetadata.prototype.toBytes = function() {
	return this.toBufferMaker(new BufferMaker()).make();
}

StreamrBinaryMessageWithKafkaMetadata.prototype.toBufferMaker = function(bufferMaker) {
	// First add all of the original msg. It can be a StreamrBinaryMessage or binary buffer
	if (this.streamrBinaryMessage instanceof StreamrBinaryMessage) {
		this.streamrBinaryMessage.toBufferMaker(bufferMaker)
	} else {
		bufferMaker.string(buf)
	}

	return bufferMaker
		.Int8(this.version)
		.Int64BE(this.offset)
		.Int64BE(this.previousOffset !== undefined ? this.previousOffset : -1)
		.Int32BE(this.kafkaPartition)
}

StreamrBinaryMessageWithKafkaMetadata.prototype.getStreamrBinaryMessage = function(contentAsBuffer) {
	if (!(this.streamrBinaryMessage instanceof StreamrBinaryMessage)) {
		this.streamrBinaryMessage = StreamrBinaryMessage.fromBytes(this.streamrBinaryMessage, contentAsBuffer)
	}
	return this.streamrBinaryMessage
}

/*static*/ StreamrBinaryMessageWithKafkaMetadata.fromBytes = function(buf, contentAsBuffer) {
	// Redis suffixes some fields to the buffer
	var reader = new BufferReader(buf)
	var streamrBinaryMessage = StreamrBinaryMessage.fromBytes(reader, contentAsBuffer)

	// Read the rest of the buffer, containing this class's fields
	var version = reader.nextInt8()
	if (version === 0) {
		var offset = new Int64(reader.nextBuffer(8)).valueOf()
		var previousOffset = new Int64(reader.nextBuffer(8)).valueOf()
		var kafkaPartition = reader.nextInt32BE()

		return new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, offset, previousOffset >= 0 ? previousOffset : undefined, kafkaPartition)
	}
	else {
		throw "Unknown version: "+version
	}

}

StreamrBinaryMessageWithKafkaMetadata.prototype.toArray = function(contentAsBuffer = true) {
	// Ensure the StreamrBinaryMessage is parsed
	var m = this.getStreamrBinaryMessage(contentAsBuffer)
	return [
		m.version,
		m.streamId,
		m.streamPartition,
		m.timestamp,
		m.ttl,
		this.offset,
		this.previousOffset,
		m.contentType,
		contentAsBuffer ? m.content.toString('utf8') : m.content
	]
}

StreamrBinaryMessageWithKafkaMetadata.prototype.toObject = function(contentAsBuffer = true) {
	// Ensure the StreamrBinaryMessage is parsed
	var m = this.getStreamrBinaryMessage(contentAsBuffer)
	return {
		version: m.version,
		streamId: m.streamId,
		partition: m.streamPartition,
		timestamp: m.timestamp,
		ttl: m.ttl,
		offset: this.offset,
		previousOffset: this.previousOffset,
		contentType: m.contentType,
		content: contentAsBuffer ? m.content.toString('utf8') : m.content
	}
}


module.exports = StreamrBinaryMessageWithKafkaMetadata
