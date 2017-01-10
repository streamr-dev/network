var assert = require('assert')
var StreamrBinaryMessage = require('../lib/protocol/StreamrBinaryMessage')

describe('StreamrBinaryMessage', function () {

	var version
	var streamId = "streamId"
	var streamPartition = 0
	var msg = {foo: "bar"}
	var timestamp = Date.now()
	var ttl = 100

	describe('version 28', function() {

		var bytes

		beforeEach(function() {
			version = 28
			bytes = new StreamrBinaryMessage(streamId, streamPartition, timestamp, ttl, StreamrBinaryMessage.CONTENT_TYPE_JSON, msg).toBytes()
		})

		it('toBytes/fromBytes', function() {
			var m = StreamrBinaryMessage.fromBytes(bytes)

			assert.equal(m.version, version)
			assert.equal(m.streamId, streamId)
			assert.equal(m.streamPartition, streamPartition)
			assert.equal(m.timestamp, timestamp)
			assert.equal(m.ttl, ttl)
			assert.equal(m.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
			assert.deepEqual(m.content, msg)
		})

		it('toBytes/fromBytes with skipPayload=true', function() {
			var m = StreamrBinaryMessage.fromBytes(bytes, true)

			assert.equal(m.version, version)
			assert.equal(m.streamId, streamId)
			assert.equal(m.streamPartition, streamPartition)
			assert.equal(m.timestamp, timestamp)
			assert.equal(m.ttl, ttl)
			assert.equal(m.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
			assert.deepEqual(m.content, undefined)
		})

	})

});
