var assert = require('assert'),
	protocol = require('../lib/protocol')

describe('protocol', function () {

	var version
	var offset = 100
	var previousOffset = 99
	var partition = 0
	var streamId = "streamId"
	var streamPartition = 0
	var msg = {foo: "bar"}
	var timestamp = Date.now()
	var ttl = 100

	describe('version 28', function() {

		beforeEach(function() {
			version = 28
		})

		it('encode/decode', function() {
			var buf = protocol.encode(version, timestamp, ttl, streamId, streamPartition, protocol.CONTENT_TYPE_JSON, msg)
			var result = protocol.decode(buf, offset, previousOffset)

			assert.equal(protocol.get('version', result), version)
			assert.equal(protocol.get('streamId', result), streamId)
			assert.equal(protocol.get('streamPartition', result), streamPartition)
			assert.equal(protocol.get('timestamp', result), timestamp)
			assert.equal(protocol.get('ttl', result), ttl)
			assert.equal(protocol.get('offset', result), offset)
			assert.equal(protocol.get('previousOffset', result), previousOffset)
			assert.equal(protocol.get('contentType', result), protocol.CONTENT_TYPE_JSON)
			assert.deepEqual(protocol.get('content', result), msg)
		})

		it('encode/decode with skipPayload=true', function() {
			var buf = protocol.encode(version, timestamp, ttl, streamId, streamPartition, protocol.CONTENT_TYPE_JSON, msg)
			var result = protocol.decode(buf, offset, previousOffset, true)

			assert.equal(protocol.get('version', result), version)
			assert.equal(protocol.get('streamId', result), streamId)
			assert.equal(protocol.get('streamPartition', result), streamPartition)
			assert.equal(protocol.get('timestamp', result), timestamp)
			assert.equal(protocol.get('ttl', result), ttl)
			assert.equal(protocol.get('offset', result), offset)
			assert.equal(protocol.get('previousOffset', result), previousOffset)
			assert.equal(protocol.get('contentType', result), protocol.CONTENT_TYPE_JSON)
			assert.equal(protocol.get('content', result), undefined)
		})

		it('encode/decode redis extension', function() {
			var buf = protocol.encode(version, timestamp, ttl, streamId, streamPartition, protocol.CONTENT_TYPE_JSON, msg)
			var redisBuf = protocol.encodeRedisSuffix(buf, 0, offset, previousOffset, partition)
			var result = protocol.decodeRedis(redisBuf)

			assert.equal(protocol.get('version', result), version)
			assert.equal(protocol.get('streamId', result), streamId)
			assert.equal(protocol.get('streamPartition', result), streamPartition)
			assert.equal(protocol.get('timestamp', result), timestamp)
			assert.equal(protocol.get('offset', result), offset)
			assert.equal(protocol.get('previousOffset', result), previousOffset)
			assert.equal(protocol.get('contentType', result), protocol.CONTENT_TYPE_JSON)
			assert.deepEqual(protocol.get('content', result), msg)
			assert.equal(protocol.get('ttl', result), ttl)
		})

		it('encode/decode redis extension with undefined previousOffset', function() {
			previousOffset = undefined

			var buf = protocol.encode(version, timestamp, ttl, streamId, streamPartition, protocol.CONTENT_TYPE_JSON, msg)
			var redisBuf = protocol.encodeRedisSuffix(buf, 0, offset, previousOffset, partition)
			var result = protocol.decodeRedis(redisBuf)

			assert.equal(protocol.get('previousOffset', result), undefined)
		})
	})

});
