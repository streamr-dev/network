const assert = require('assert')
const encoder = require('../lib/message-encoder')
const StreamrBinaryMessage = require('../lib/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../lib/protocol/StreamrBinaryMessageWithKafkaMetadata')

describe('MessageEncoder', function() {

	var msgWithMetaData

	beforeEach(function() {
		const payload = {
			hello: "world",
			numberOfTheBeast: 666
		}
		const streamrBinaryMessage = new StreamrBinaryMessage("streamId", 0, new Date(2017, 2, 24, 13, 45, 0), 0,
			StreamrBinaryMessage.CONTENT_TYPE_JSON, payload)
		msgWithMetaData = new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, 25, 24, 0)
	})

	it("broadcastMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 0, '', msgWithMetaData.toArray()])
		assert.equal(encoder.broadcastMessage(msgWithMetaData), expected)
	})

	describe("unicastMessage", function() {
		it ("without subId produces correct messages", function() {
			const expected = JSON.stringify([0, 1, '', msgWithMetaData.toArray()])
			assert.equal(encoder.unicastMessage(msgWithMetaData), expected)
		})

		it ("with subId produces correct messages", function() {
			const expected = JSON.stringify([0, 1, 'subId', msgWithMetaData.toArray()])
			assert.equal(encoder.unicastMessage(msgWithMetaData, 'subId'), expected)
		})
	})

	it("subscribedMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 2, '', msgWithMetaData.toArray()])
		assert.equal(encoder.subscribedMessage(msgWithMetaData), expected)
	})

	it("unsubscribedMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 3, '', msgWithMetaData.toArray()])
		assert.equal(encoder.unsubscribedMessage(msgWithMetaData), expected)
	})

	it("resendingMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 4, '', msgWithMetaData.toArray()])
		assert.equal(encoder.resendingMessage(msgWithMetaData), expected)
	})

	it("resentMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 5, '', msgWithMetaData.toArray()])
		assert.equal(encoder.resentMessage(msgWithMetaData), expected)
	})

	it("noResendMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 6, '', msgWithMetaData.toArray()])
		assert.equal(encoder.noResendMessage(msgWithMetaData), expected)
	})

	it("errorMessage produces correct messages", function() {
		const expected = JSON.stringify([0, 7, '', msgWithMetaData.toArray()])
		assert.equal(encoder.errorMessage(msgWithMetaData), expected)
	})
})