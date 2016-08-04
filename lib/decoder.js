var Int64 = require('node-int64')

exports.decode = function(buf) {
	var version = buf.readInt8(0)

	if (version===28) {
		var ts = new Int64(buf, 1).valueOf()
		var streamIdLength = buf.readUInt8(9)
		var streamId = buf.toString("UTF-8", 10, 10 + streamIdLength)
		var contentType = buf.readInt8(10 + streamIdLength)
		var contentLength = buf.readInt32BE(11 + streamIdLength)

		// JSON content type
		if (contentType === 27) {
			var msg = JSON.parse(buf.toString('UTF-8', 15 + streamIdLength, 15 + streamIdLength + contentLength))
			return {
				timestamp: ts,
				streamIdLength: streamIdLength,
				streamId: streamId,
				contentType: contentType,
				contentLength: contentLength,
				message: msg
			}
		}
		else {
			console.log("decode: Invalid content type: "+contentType)
		}
	}
}
