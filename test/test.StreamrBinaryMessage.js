var assert = require('assert')
const BufferMaker = require('buffermaker')
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

		describe('toBytes/fromBytes', function() {

			it('must not alter the field content', function() {
				var m = StreamrBinaryMessage.fromBytes(bytes)

				assert.equal(m.version, version)
				assert.equal(m.streamId, streamId)
				assert.equal(m.streamPartition, streamPartition)
				assert.equal(m.timestamp, timestamp)
				assert.equal(m.ttl, ttl)
				assert.equal(m.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
				assert.deepEqual(m.content, msg)
			})

			it('must not parse the content with skipContentParsing=true', function() {
				var m = StreamrBinaryMessage.fromBytes(bytes, true)

				assert.equal(m.version, version)
				assert.equal(m.streamId, streamId)
				assert.equal(m.streamPartition, streamPartition)
				assert.equal(m.timestamp, timestamp)
				assert.equal(m.ttl, ttl)
				assert.equal(m.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
				assert(Buffer.isBuffer(m.content))
			})

			it('must not fail if content is already a buffer', function() {
				var msgBuf = new BufferMaker().string(JSON.stringify(msg)).make()
				bytes = new StreamrBinaryMessage(streamId, streamPartition, timestamp, ttl, StreamrBinaryMessage.CONTENT_TYPE_JSON, msgBuf).toBytes()
				var m = StreamrBinaryMessage.fromBytes(bytes)

				assert.deepEqual(m.content, msg)
			})

		})

	})

});
