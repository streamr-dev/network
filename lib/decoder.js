var Int64 = require('node-int64')
var BufferMaker = require('buffermaker')

var CONTENT_TYPE_JSON = exports.CONTENT_TYPE_JSON = 27

exports.decode = function(buf, offset) {
	var version = buf.readInt8(0)

	if (version===28) {
		var ts = new Int64(buf, 1).valueOf()
		var streamIdLength = buf.readUInt8(9)
		var streamId = buf.toString("UTF-8", 10, 10 + streamIdLength)
		var contentType = buf.readInt8(10 + streamIdLength)
		var contentLength = buf.readInt32BE(11 + streamIdLength)

		// JSON content type
		if (contentType === 27) {
			var content = JSON.parse(buf.toString('UTF-8', 15 + streamIdLength, 15 + streamIdLength + contentLength))
			return [version, streamId, ts, offset, contentType, content]
		}
		else {
			console.log("decode: Invalid content type: "+contentType)
		}
	}
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
	'28': ['version', 'streamId', 'timestamp', 'offset', 'contentType', 'content']
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
