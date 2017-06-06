const assert = require('assert')
const sinon = require('sinon')
const EventEmitter = require('events');

describe('RESTful produce endpoint', function () {

	var streamFetcher
	var partitioner
	var kafka
	var res

	var handler

	const mockRequest = function(streamId, obj) {
		return Object.assign({}, {
			body: new Buffer("{}"),
			get: sinon.stub().withArgs("Authorization").returns("token authKey"),
			query: {},
			params: {
				id: streamId
			}
		}, obj)
	}

	beforeEach(function() {
		streamFetcher = {
			authenticatedFetch: sinon.stub().resolves({streamId: "streamId", partitions: 10}),
            authenticate: sinon.stub().resolves(true)
		}
		kafka = new EventEmitter()
		kafka.send = sinon.stub().yields()

		res = {}
		res.status = sinon.stub().returns(res)
		res.send = sinon.stub().returns(res)

		partitioner = {
			partition: sinon.stub().returns(0)
		}

		handler = require('../lib/rest-produce-endpoints')(streamFetcher, kafka, partitioner)
	})

	describe('producing before kafka is ready', function() {
		it('returns 503', function(done) {
			handler(mockRequest("streamId"), res)
			setTimeout(function() {
				assert(res.status.calledWith(503))
				done()
			})
		});
	})

	describe('producing after kafka is ready', function() {

		beforeEach('kafka is ready', function() {
			kafka.emit('ready')
		})

		afterEach('the response must be sent', function() {
			assert(res.send.calledOnce)
		})

		it('should return 200 for valid requests', function(done) {
			handler(mockRequest("streamId"), res)
			setTimeout(function() {
				assert(res.status.calledWith(200))
				done()
			})
		});

		it('should return 400 if there is no body', function(done) {
			handler(mockRequest("streamId", {
				body: undefined,
			}), res)
			setTimeout(function() {
				assert(res.status.calledWith(400))
				done()
			})
		});

		it('should return 400 for malformed Authorization header without trying to authenticate', function() {
			handler(mockRequest("test-auth", {
				get: sinon.stub().withArgs("Authorization").returns("foo"),
			}), res)
			assert(res.status.calledWith(400))
			assert(streamFetcher.authenticate.notCalled)
		})

		it('should authenticate with key given in headers', function(done) {
			handler(mockRequest("test-auth", {
				get: sinon.stub().withArgs("Authorization").returns("token secret")
			}), res)
			setTimeout(function() {
				assert(streamFetcher.authenticate.calledWith("test-auth", "secret"))
				done()
			})
		})

		it('should return whatever error code authenticate fails with', function(done) {
			streamFetcher.authenticate = sinon.stub().rejects(999)
			handler(mockRequest("test-auth"), res)
			setTimeout(function() {
				assert(res.status.calledWith(999))
				done()
			})
		})

		it('should return whatever error code authenticatedFetch fails with', function(done) {
			streamFetcher.authenticatedFetch = sinon.stub().rejects(999)
			handler(mockRequest("test-auth"), res)
			setTimeout(function() {
				assert(res.status.calledWith(999))
				done()
			})
		})

		it('should fetch stream after successful authentication', function(done) {
			handler(mockRequest("test"), res)
			setTimeout(function() {
				assert(streamFetcher.authenticatedFetch.calledWith('test', 'authKey'))
				done()
			})
		})

		it('should give undefined partition key to partitioner if none is defined', function(done) {
			handler(mockRequest("test"), res)
			setTimeout(function() {
				assert(partitioner.partition.calledWith(10, undefined))
				done()
			})
		})

		it('should call partitioner using a given partition key', function(done) {
			handler(mockRequest("test", {
				query: {
					pkey: "foo"
				}
			}), res)
			setTimeout(function() {
				assert(partitioner.partition.calledWith(10, "foo"))
				done()
			})
		})

		it('should produce to kafka', function(done) {
			handler(mockRequest("test"), res)
			setTimeout(function() {
				assert(kafka.send.calledOnce)
				done()
			})
		});

		it('should call kafka.send() with correct stream id and partition returned by the partitioner', function(done) {
			partitioner.partition = sinon.stub().withArgs(10, "pkey").returns(5)
			handler(mockRequest("test", {
				query: {
					pkey: "pkey"
				}
			}), res)

			setTimeout(function() {
				var streamrBinaryMessage = kafka.send.getCall(0).args[0]
				assert.equal(streamrBinaryMessage.streamId, "test")
				assert.equal(streamrBinaryMessage.streamPartition, 5)
				done()
			})
		});

		it('should use current timestamp', function(done) {
			var timestamp = Date.now()
			handler(mockRequest("test"), res)

			setTimeout(function() {
				var streamrBinaryMessage = kafka.send.getCall(0).args[0]
				assert(streamrBinaryMessage.timestamp >= timestamp, streamrBinaryMessage.timestamp+" >= "+timestamp)
				var now = Date.now()
				assert(streamrBinaryMessage.timestamp <= now, streamrBinaryMessage+" <= "+now)
				done()
			})
		})

		it('should use ttl if given', function (done) {
			var ttl = 30
			handler(mockRequest("test", {
				query: {
					ttl: ttl.toString()
				}
			}), res)

			setTimeout(function() {
				var streamrBinaryMessage = kafka.send.getCall(0).args[0]
				assert.equal(streamrBinaryMessage.ttl, ttl)
				done()
			})
		});

		it('should return 400 for invalid ttl', function () {
			handler(mockRequest("test", {
				query: {
					ttl: "foo"
				}
			}), res)
			assert(res.status.calledWith(400))
		});

		it('returns 500 if there is an error producing to kafka', function (done) {
			kafka.send = sinon.stub().yields("error")
			handler(mockRequest("test"), res)
			setTimeout(function() {
				assert(res.status.calledWith(500))
				done()
			})
		});
		
	})

});