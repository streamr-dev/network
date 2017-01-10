var assert = require('assert')
var StreamrBinaryMessage = require('../lib/protocol/StreamrBinaryMessage')
var StreamrBinaryMessageWithKafkaMetadata = require('../lib/protocol/StreamrBinaryMessageWithKafkaMetadata')

describe('StreamrBinaryMessageWithKafkaMetadata', function () {

	var offset = 100
	var previousOffset = 99
	var kafkaPartition = 0

	var streamId = "streamId"
	var streamPartition = 0
	var content = {foo: "bar"}
	var timestamp = Date.now()
	var ttl = 100

	var version

	describe('version 0', function() {

		var streamrBinaryMessage

		beforeEach(function() {
			version = 0
			streamrBinaryMessage = new StreamrBinaryMessage(streamId, streamPartition, timestamp, ttl, StreamrBinaryMessage.CONTENT_TYPE_JSON, content)
		})

		describe('toBytes/fromBytes', function() {

			it('must encode/decode the values properly', function() {
				var bytes = new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, offset, previousOffset, kafkaPartition).toBytes()
				var m = StreamrBinaryMessageWithKafkaMetadata.fromBytes(bytes)

				assert.equal(m.version, version)
				assert.equal(m.offset, offset)
				assert.equal(m.previousOffset, previousOffset)
			})

			it('must support undefined previousOffset', function() {
				previousOffset = undefined
				var bytes = new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, offset, previousOffset, kafkaPartition).toBytes()
				var m = StreamrBinaryMessageWithKafkaMetadata.fromBytes(bytes)

				assert.equal(m.previousOffset, previousOffset)
			})

			it('must keep the wrapped StreamrBinaryMessage untouched', function() {
				var bytes = new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, offset, previousOffset, kafkaPartition).toBytes()
				var m = StreamrBinaryMessageWithKafkaMetadata.fromBytes(bytes).getStreamrBinaryMessage()

				assert.equal(m.streamId, streamId)
				assert.equal(m.streamPartition, streamPartition)
				assert.equal(m.timestamp, timestamp)
				assert.equal(m.ttl, ttl)
				assert.equal(m.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
				assert.deepEqual(m.content, content)
			})
		})

		describe('toArray()', function() {
			it('must produce the correct result', function() {
				var msg = new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, offset, previousOffset, kafkaPartition)
				var arr = msg.toArray()
				var s = streamrBinaryMessage

				assert.deepEqual(arr, [s.version, s.streamId, s.streamPartition, s.timestamp, s.ttl, msg.offset, msg.previousOffset, s.contentType, s.content])
			})
		})

	})

});
