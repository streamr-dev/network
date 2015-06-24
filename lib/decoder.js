var Int64 = require('node-int64')

exports.decode = function(buf) {
	if (!Buffer.isBuffer(buf)) {
		return {
			message: buf
		}
	}

	// Recognized UnifinaKafkaProducer format
	if (buf.length>9 && buf.readInt8(0)===27 && buf.readInt8(9)===27) {
		var msg = JSON.parse(buf.toString('utf8', 10))
		var ts = new Int64(buf, 1).valueOf()
		return {
			message: msg,
			timestamp: ts
		}
	}
	// Unrecognized format, try to parse JSON
	else {
		try {
			return {
				message: JSON.parse(buf.toString('utf8', 0))
			}
		} catch (err) {
			// If unsuccessful, return as is
			return {
				message: buf
			}
		}
	}
}
