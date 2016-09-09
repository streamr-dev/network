var assert = require('assert'),
	decoder = require('../lib/decoder')

describe('decoder', function () {

	describe('version 28', function() {

		it('should encode/decode as expected', function() {
			var version = 28
			var offset = 100
			var previousOffset = 99
			var streamId = "streamId"
			var msg = {foo: "bar"}
			var timestamp = Date.now()
			var buf = decoder.encode(version, timestamp, streamId, decoder.CONTENT_TYPE_JSON, msg)

			var result = decoder.decode(buf, offset, previousOffset)

			assert.equal(decoder.get('version', result), version)
			assert.equal(decoder.get('streamId', result), streamId)
			assert.equal(decoder.get('timestamp', result), timestamp)
			assert.equal(decoder.get('offset', result), offset)
			assert.equal(decoder.get('previousOffset', result), previousOffset)
			assert.equal(decoder.get('contentType', result), decoder.CONTENT_TYPE_JSON)
			assert.deepEqual(decoder.get('content', result), msg)
		})
	})

});
