const Int64 = require('node-int64')
const BufferMaker = require('buffermaker')
const BufferReader = require('buffer-reader')

var CONTENT_TYPE_JSON = exports.CONTENT_TYPE_JSON = 27

exports.decode = function(buf, offset, previousOffset) {
	var reader = buf instanceof BufferReader ? buf : new BufferReader(buf)
	var version = reader.nextInt8()

	if (version===28) {
		var ts = new Int64(reader.nextBuffer(8)).valueOf()
		var streamIdLength = reader.nextUInt8()
		var streamId = reader.nextString(streamIdLength, 'UTF-8')
		var contentType = reader.nextInt8()
		var contentLength = reader.nextInt32BE()

		// JSON content type
		if (contentType === 27) {
			var content = JSON.parse(reader.nextString(contentLength, 'UTF-8'))
			return [version, streamId, ts, offset, previousOffset, contentType, content]
		}
		else {
			console.log("decode: Invalid content type: "+contentType)
		}
	}
}

exports.decodeStreamId = function(buf) {
	var version = buf.readInt8(0)

	if (version===28) {
		var streamIdLength = buf.readUInt8(9)
		return buf.toString('UTF-8', 10, 10 + streamIdLength)
	}
}

exports.decodeTimestamp = function(buf) {
	var version = buf.readInt8(0)

	if (version===28) {
		return new Int64(buf, 1).valueOf()
	}
}

exports.encodeRedisSuffix = function(buf, version, offset, previousOffset, partition) {
	if (version === 0) {
		return new BufferMaker()
			// First add all of the original buf
			.string(buf)
			.Int8(version)
			.Int64BE(offset)
			.Int64BE(previousOffset || -1) // what happens if undefined?
			.Int32BE(partition)
			.make();
	}
}

exports.decodeRedis = function(buf) {
	// Redis suffixes some fields to the buffer
	var reader = new BufferReader(buf)
	var msg = this.decode(reader)

	// Read the rest of the buffer, containing the extension
	var version = reader.nextInt8()
	if (version === 0) {
		var offset = new Int64(reader.nextBuffer(8)).valueOf()
		var previousOffset = new Int64(reader.nextBuffer(8)).valueOf()

		// don't need to read partition

		this.set('offset', msg, offset)
		this.set('previousOffset', msg, previousOffset >= 0 ? previousOffset : undefined)
	}
	else {
		debug("decodeMessage: unknown version: %d! Unable to read offset and previousOffset", version)
	}

	return msg
}

exports.encode = function(version, timestamp, streamId, contentType, content) {
	if (version === 28 && contentType === CONTENT_TYPE_JSON) {
		var streamIdBuf = new BufferMaker().string(streamId).make()
		var contentBuf = new BufferMaker().string(JSON.stringify(content)).make()

		return new BufferMaker()
			// byte 0: version (1 byte)
			.Int8(version)
			// 1: timestamp (8)
			.Int64BE(timestamp)
			// 9: streamIdLength (1)
			.UInt8(streamIdBuf.length)
			// 10: streamId (variable length)
			.string(streamId)
			// 10 + streamIdLength: contentType (1)
			.Int8(contentType)
			// 11 + streamIdLength: contentLength (4)
			.Int32BE(contentBuf.length)
			// 15 + streamIdLength: content (variable length)
			.string(JSON.stringify(content))
			.make();
	}
}

var versionFields = {
	'28': ['version', 'streamId', 'timestamp', 'offset', 'previousOffset', 'contentType', 'content']
}

exports.get = function(field, msg) {
	if (msg == null || msg[0] == null || versionFields[msg[0]] == null) {
		return undefined
	}

	var idx = versionFields[msg[0].toString()].indexOf(field)
	if (idx >= 0) {
		return msg[idx]
	}
	else {
		return undefined
	}
}

exports.set = function(field, msg, value) {
	if (msg == null || msg[0] == null || versionFields[msg[0]] == null) {
		return
	}

	var idx = versionFields[msg[0].toString()].indexOf(field)
	if (idx >= 0) {
		msg[idx] = value
	}
}