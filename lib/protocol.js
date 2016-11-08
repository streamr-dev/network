const Int64 = require('node-int64')
const BufferMaker = require('buffermaker')
const BufferReader = require('buffer-reader')

var CONTENT_TYPE_JSON = exports.CONTENT_TYPE_JSON = 27

exports.CURRENT_VERSION = 28
exports.CURRENT_BROWSER_VERSION = 0

exports.decode = function(buf, offset, previousOffset, skipContent) {
	var reader = buf instanceof BufferReader ? buf : new BufferReader(buf)
	var version = reader.nextInt8()

	if (version===28) {
		var ts = new Int64(reader.nextBuffer(8)).valueOf()
		var ttl = reader.nextInt32BE()
		var streamIdLength = reader.nextUInt8()
		var streamId = reader.nextString(streamIdLength, 'UTF-8')
		var streamPartition = reader.nextUInt8()
		var contentType = reader.nextInt8()
		var contentLength = reader.nextInt32BE()
		var content

		if (skipContent) {
			// Ignore the payload
		}
		else if (contentType === 27) {
			// JSON content type
			content = JSON.parse(reader.nextString(contentLength, 'UTF-8'))
		}
		else {
			console.log("decode: Invalid content type: "+contentType)
		}

		return [version, streamId, streamPartition, ts, ttl, offset, previousOffset, contentType, content]
	}
}

exports.decodeStreamId = function(buf) {
	var version = buf.readInt8(0)

	if (version===28) {
		var streamIdLength = buf.readUInt8(13)
		return buf.toString('UTF-8', 14, 14 + streamIdLength)
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

var browserMessageTypes = ['b', 'u', 'subscribed', 'unsubscribed', 'resending', 'resent', 'no_resend']
var browserMessageTypeCodes = {}
for (var i=0; i<browserMessageTypes; i++) {
	browserMessageTypeCodes[browserMessageTypes[i]] = i
}
exports.BROWSER_MSG_TYPE_BROADCAST = 0
exports.BROWSER_MSG_TYPE_UNICAST = 1
exports.BROWSER_MSG_TYPE_SUBSCRIBED = 2
exports.BROWSER_MSG_TYPE_UNSUBSCRIBED = 3
exports.BROWSER_MSG_TYPE_RESENDING = 4
exports.BROWSER_MSG_TYPE_RESENT = 5
exports.BROWSER_MSG_TYPE_NO_RESEND = 6
exports.BROWSER_MSG_TYPE_ERROR = 7

exports.encodeForBrowser = function(type, buf, subId) {
	if (type < 0 || type > 6) {
		throw "Unknown browser message type: "+type
	}

	// Response types are sent as stringified JSON, unicast/broadcast messages sent as is
	if (type !== exports.BROWSER_MSG_TYPE_BROADCAST && type !== exports.BROWSER_MSG_TYPE_UNICAST) {
		buf = JSON.stringify(buf)
	}

	subId = subId || ""

	return new BufferMaker()
		.UInt8(exports.CURRENT_BROWSER_VERSION)
		.UInt8(type)
		.UInt8(subId.toString().length)
		.string(subId.toString())
		// Rest of the buffer is the original raw msg
		.string(buf)
		.make();
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

exports.encode = function(version, timestamp, ttl, streamId, streamPartition, contentType, content) {
	if (version === 28 && contentType === CONTENT_TYPE_JSON) {
		var streamIdBuf = new BufferMaker().string(streamId).make()
		var contentBuf = Buffer.isBuffer(content) ? content : new BufferMaker().string(JSON.stringify(content)).make()

		return new BufferMaker()
			// byte 0: version (1 byte)
			.Int8(version)
			// 1: timestamp (8)
			.Int64BE(timestamp)
			// 9: ttl (4)
			.Int32BE(ttl)
			// 13: streamIdLength (1)
			.UInt8(streamIdBuf.length)
			// 14: streamId (variable length)
			.string(streamId)
			// 14 + streamIdLength: streamPartition (1)
			.UInt8(streamPartition)
			// 15 + streamIdLength: contentType (1)
			.Int8(contentType)
			// 16 + streamIdLength: contentLength (4)
			.Int32BE(contentBuf.length)
			// 20 + streamIdLength: content (variable length)
			.string(contentBuf)
			.make();
	}
}

var versionFields = {
	'28': ['version', 'streamId', 'streamPartition', 'timestamp', 'ttl', 'offset', 'previousOffset', 'contentType', 'content']
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