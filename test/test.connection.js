var assert = require('assert')
var Connection = require('../lib/connection.js')
var Stream = require('../lib/stream.js')

describe('Connection', function () {

	var connection

	beforeEach(function() {
		connection = new Connection("id", {})	
	})

	describe('addStream', function() {
		it('should add the given stream to streams array', function() {
			connection.addStream(new Stream('stream', 0))
			assert.equal(connection.getStreams().length, 1)
			assert.equal(connection.getStreams()[0].id, 'stream')
			connection.addStream(new Stream('stream2', 0))
			assert.equal(connection.getStreams().length, 2)
			assert.equal(connection.getStreams()[1].id, "stream2")
		})
	})

	describe('removeStream', function() {
		beforeEach(function() {
			connection.addStream(new Stream('stream', 0))
			connection.addStream(new Stream('stream2', 0))
		})

		it('should remove the given stream from streams array', function() {
			connection.removeStream("stream", 0)
			assert.equal(connection.getStreams().length, 1)
			assert.equal(connection.getStreams()[0].id, "stream2")
			connection.removeStream("stream2", 0)
			assert.equal(connection.getStreams().length, 0)
		})
	})

	describe('getStreams', function() {
		beforeEach(function() {
			connection.addStream(new Stream('stream', 0))
			connection.addStream(new Stream('stream2', 0))
		})

		it('should return a copy of the streams array', function() {
			var streams = connection.getStreams()
			assert.equal(streams.length, 2)
			// Modify the copy
			streams.push("foo")
			assert.equal(streams.length, 3)
			assert.equal(connection.getStreams().length, 2)
		})
	})

});