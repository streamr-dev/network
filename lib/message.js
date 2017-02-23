const protocol = require('./protocol')

function Message(version, streamId, streamPartition, timestamp, ttl, contentType, contentBuf) {
	this.version = version
	this.streamId = streamId
	this.streamPartition = streamPartition
	this.timestamp = timestamp
	this.ttl = ttl
	this.contentType = contentType
	this.contentBuf = contentBuf
}

Message.prototype.getContentAsBuffer = function() {
	return this.contentBuf
}

Message.prototype.getContentAsString = function() {
	return this.contentBuf.toString('utf8')
}

Message.prototype.getContentAsParsed = function() {
	if (this.contentType == protocol.CONTENT_TYPE_JSON) {
		return JSON.parse(this.contentBuf.toString('utf8'))
	} else {
		throw "Unknown content type: "+this.contentType
	}
}

module.exports = Message
