exports.decode = function(buf) {
	if (!Buffer.isBuffer(buf))
		return buf

	// If this is not a recognized version, return the message as-is
	var version = buf.readInt8(0)
	if (version!==27)
		return buf

	// If the format is not JSON, return as-is
	var format = buf.readInt8(9)
	if (format!==27)
		return buf
	else return JSON.parse(buf.toString('utf8', 10))
}
