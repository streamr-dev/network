const assert = require('assert')
const sinon = require('sinon')

const StreamrBinaryMessage = require('../lib/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../lib/protocol/StreamrBinaryMessageWithKafkaMetadata')
const StreamrBinaryMessageBundle = require('../lib/protocol/StreamrBinaryMessageBundle')

describe('StreamrBinaryMessageBundle', function () {

	const kafkaPartition = 0
	const streamId = "streamId"
	const streamPartition = 0
	const content = {foo: "bar"}
	const ttl = 100

	describe('version 0', function() {

		var streamrBinaryMessages
		var streamrBinaryMessagesWithKafkaMetadata

		beforeEach(function() {
			offset = 0
			streamrBinaryMessages = []

			for (var i=0; i<10; i++) {
				streamrBinaryMessages.push(new StreamrBinaryMessage(streamId, streamPartition, new Date(), ttl, StreamrBinaryMessage.CONTENT_TYPE_JSON, content))
			}

			streamrBinaryMessagesWithKafkaMetadata = streamrBinaryMessages.map(function(streamrBinaryMessage) {
				offset++
				return new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, offset, offset-1, kafkaPartition)
			})
		})

		describe('toBytes', function() {
			it('must return the correct bundle values', function() {
				var bundle = new StreamrBinaryMessageBundle(streamId, streamPartition)
				streamrBinaryMessagesWithKafkaMetadata.forEach(function(it) {
					bundle.add(it)
				})

				var byteData = bundle.toBytes()

				assert.equal(byteData.count, streamrBinaryMessagesWithKafkaMetadata.length)
				assert.equal(byteData.firstOffset, streamrBinaryMessagesWithKafkaMetadata[0].offset)
				assert.equal(byteData.lastOffset, streamrBinaryMessagesWithKafkaMetadata[streamrBinaryMessagesWithKafkaMetadata.length-1].offset)
				assert.equal(byteData.firstTimestamp, streamrBinaryMessagesWithKafkaMetadata[0].getStreamrBinaryMessage().timestamp)
				assert.equal(byteData.lastTimestamp, streamrBinaryMessagesWithKafkaMetadata[streamrBinaryMessagesWithKafkaMetadata.length-1].getStreamrBinaryMessage().timestamp)
			})
		})

		describe('fromBytes', function() {
			it('must reconstruct the original messages', function () {
				var bundle = new StreamrBinaryMessageBundle(streamId, streamPartition)
				streamrBinaryMessagesWithKafkaMetadata.forEach(function(it) {
					bundle.add(it)
				})

				var byteData = bundle.toBytes()

				var arr = StreamrBinaryMessageBundle.fromBytes(byteData.bytes)
				assert.equal(arr.length, streamrBinaryMessagesWithKafkaMetadata.length)

				for (var i=0; i<arr.length; i++) {
					var a = streamrBinaryMessagesWithKafkaMetadata[i]
					var b = arr[i]

					assert.equal(a.offset, b.offset)
					assert.equal(a.previousOffset, b.previousOffset)

					assert.equal(a.getStreamrBinaryMessage().timestamp, b.getStreamrBinaryMessage().timestamp)
					assert.deepEqual(a.getStreamrBinaryMessage().content, b.getStreamrBinaryMessage().content)
				}
			})
		})

	})

});
