const assert = require('assert')
const Stream = require('../lib/stream')

describe('Stream', function() {
	it('addConnection adds connections', function() {
		const stream = new Stream('id', 0, 'subscribed')
		stream.addConnection('a')
		stream.addConnection('b')
		stream.addConnection('c')
		assert.deepEqual(stream.getConnections(), ['a', 'b', 'c'])
	})
	
	describe("removeConnection", function() {
		var stream

		beforeEach(function() {
			stream = new Stream('id', 0, 'subscribed')
			stream.addConnection('a')
			stream.addConnection('b')
			stream.addConnection('c')
		})

		it ("removes connection when connection exists", function() {
			stream.removeConnection('b')
			assert.deepEqual(stream.getConnections(), ['a', 'c'])
		})

		it ("does not remove anything if connection does not exist", function() {
			stream.removeConnection('d')
			assert.deepEqual(stream.getConnections(), ['a', 'b', 'c'])
		})
	})
})