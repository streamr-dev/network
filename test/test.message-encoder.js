const assert = require('assert')
const encoder = require('../lib/message-encoder')
const StreamrBinaryMessage = require('../lib/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../lib/protocol/StreamrBinaryMessageWithKafkaMetadata')

describe('MessageEncoder', function() {

	var payload
	var msgWithMetaDataAsArray

	beforeEach(function() {
		payload = JSON.stringify({
			hello: "world",
			numberOfTheBeast: 666
		})
		const streamrBinaryMessage = new StreamrBinaryMessage("streamId", 0, new Date(2017, 2, 24, 13, 45, 0), 0,
			StreamrBinaryMessage.CONTENT_TYPE_JSON, new Buffer(payload, 'utf8'))
		const msgWithMetaData = new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, 25, 24, 0)
		msgWithMetaDataAsArray = msgWithMetaData.toArray()
	})

	it("broadcastMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 0, '', [28, 'streamId', 0, 1490355900000, 0, 25, 24, 27, payload]])
		assert.equal(encoder.broadcastMessage(msgWithMetaDataAsArray), expected)
	})

	describe("unicastMessage", function() {
		it ("without subId produces correct messages", function() {
			const expected = JSON.stringify([0, 1, '', [28, 'streamId', 0, 1490355900000, 0, 25, 24, 27, payload]])
			assert.equal(encoder.unicastMessage(msgWithMetaDataAsArray), expected)
		})

		it ("with subId produces correct messages", function() {
			const expected = JSON.stringify([0, 1, 'subId', [28, 'streamId', 0, 1490355900000, 0, 25, 24, 27, payload]])
			assert.equal(encoder.unicastMessage(msgWithMetaDataAsArray, 'subId'), expected)
		})
	})

	it("subscribedMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 2, '', [28, 'streamId', 0, 1490355900000, 0, 25, 24, 27, payload]])
		assert.equal(encoder.subscribedMessage(msgWithMetaDataAsArray), expected)
	})

	it("unsubscribedMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 3, '', [28, 'streamId', 0, 1490355900000, 0, 25, 24, 27, payload]])
		assert.equal(encoder.unsubscribedMessage(msgWithMetaDataAsArray), expected)
	})

	it("resendingMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 4, '', [28, 'streamId', 0, 1490355900000, 0, 25, 24, 27, payload]])
		assert.equal(encoder.resendingMessage(msgWithMetaDataAsArray), expected)
	})

	it("resentMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 5, '', [28, 'streamId', 0, 1490355900000, 0, 25, 24, 27, payload]])
		assert.equal(encoder.resentMessage(msgWithMetaDataAsArray), expected)
	})

	it("noResendMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 6, '', [28, 'streamId', 0, 1490355900000, 0, 25, 24, 27, payload]])
		assert.equal(encoder.noResendMessage(msgWithMetaDataAsArray), expected)
	})

	it("errorMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 7, '', [28, 'streamId', 0, 1490355900000, 0, 25, 24, 27, payload]])
		assert.equal(encoder.errorMessage(msgWithMetaDataAsArray), expected)
	})
})