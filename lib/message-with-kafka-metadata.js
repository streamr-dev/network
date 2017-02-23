const protocol = require('./protocol')

function MessageWithKafkaMetadata(offset, previousOffset, message) {
	this.offset = offset
	this.previousOffset = previousOffset
	this.message = message

}

/**
 * Lazily decodes to Message
 * @returns {Message}
 */
MessageWithKafkaMetadata.prototype.getMessage = function() {
	if (Buffer.isBuffer(this.message)) {
		this.message = protocol.decodeMessage(this.message)
	}
	return this.message
}

module.exports = MessageWithKafkaMetadata
