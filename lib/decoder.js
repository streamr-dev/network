exports.decode = function(buf) {
	if (!Buffer.isBuffer(buf)) {
		return buf
	}

	// Recognized UnifinaKafkaProducer format
	if (buf.length>9 && buf.readInt8(0)===27 && buf.readInt8(9)===27) {
		return JSON.parse(buf.toString('utf8', 10))
	}
	// Unrecognized format, try to parse JSON
	else {
		try {
			return JSON.parse(buf.toString('utf8', 0))
		} catch (err) {
			// If unsuccessful, return as is
			return buf
		}
	}
}
