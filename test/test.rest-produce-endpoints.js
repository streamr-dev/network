const assert = require('assert')
const sinon = require('sinon')

describe('server', function () {

	var streamFetcher
	var partitioner
	var kafka
	var res

	var handlers

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
		app = {
			post: sinon.spy()
		}
		streamFetcher = {
			authenticatedFetch: sinon.stub().resolves({streamId: "streamId", partitions: 10}),
            authenticate: sinon.stub().resolves(true)
		}
		kafka = {
			send: sinon.stub().yields()
		}
		res = {}
		res.status = sinon.stub().returns(res)
		res.send = sinon.stub().returns(res)

		partitioner = {
			partition: sinon.stub().returns(0)
		}

		handlers = require('../lib/rest-produce-endpoints')(app, streamFetcher, kafka, partitioner)
	})

	it('should register the route handler', function() {
		app.post.calledWith('/api/v1/streams/:id/data', handlers.handleProduceRequest)
	})

	describe('handleProduceRequest', function() {

		afterEach('the response must be sent', function() {
			assert(res.send.calledOnce)
		})

		it('should return 200 for valid requests', function(done) {
			handlers.handleProduceRequest(mockRequest("streamId"), res)
			setTimeout(function() {
				assert(res.status.calledWith(200))
				done()
			})
		});

		it('should return 400 if there is no body', function(done) {
			handlers.handleProduceRequest(mockRequest("streamId", {
				body: undefined,
			}), res)
			setTimeout(function() {
				assert(res.status.calledWith(400))
				done()
			})
		});

		it('should return 400 for malformed Authorization header without trying to authenticate', function() {
			handlers.handleProduceRequest(mockRequest("test-auth", {
				get: sinon.stub().withArgs("Authorization").returns("foo"),
			}), res)
			assert(res.status.calledWith(400))
			assert(streamFetcher.authenticate.notCalled)
		})

		it('should authenticate with key given in headers', function(done) {
			handlers.handleProduceRequest(mockRequest("test-auth", {
				get: sinon.stub().withArgs("Authorization").returns("token secret")
			}), res)
			setTimeout(function() {
				assert(streamFetcher.authenticate.calledWith("test-auth", "secret"))
				done()
			})
		})

		it('should return whatever error code authenticate fails with', function(done) {
			streamFetcher.authenticate = sinon.stub().rejects(999)
			handlers.handleProduceRequest(mockRequest("test-auth"), res)
			setTimeout(function() {
				assert(res.status.calledWith(999))
				done()
			})
		})

		it('should return whatever error code authenticatedFetch fails with', function(done) {
			streamFetcher.authenticatedFetch = sinon.stub().rejects(999)
			handlers.handleProduceRequest(mockRequest("test-auth"), res)
			setTimeout(function() {
				assert(res.status.calledWith(999))
				done()
			})
		})

		it('should fetch stream after successful authentication', function(done) {
			handlers.handleProduceRequest(mockRequest("test"), res)
			setTimeout(function() {
				assert(streamFetcher.authenticatedFetch.calledWith('test', 'authKey'))
				done()
			})
		})

		it('should give undefined partition key to partitioner if none is defined', function(done) {
			handlers.handleProduceRequest(mockRequest("test"), res)
			setTimeout(function() {
				assert(partitioner.partition.calledWith(10, undefined))
				done()
			})
		})

		it('should call partitioner using a given partition key', function(done) {
			handlers.handleProduceRequest(mockRequest("test", {
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
			handlers.handleProduceRequest(mockRequest("test"), res)
			setTimeout(function() {
				assert(kafka.send.calledOnce)
				done()
			})
		});

		it('should call kafka.send() with correct stream id and partition returned by the partitioner', function(done) {
			partitioner.partition = sinon.stub().withArgs(10, "pkey").returns(5)
			handlers.handleProduceRequest(mockRequest("test", {
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
			handlers.handleProduceRequest(mockRequest("test"), res)

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
			handlers.handleProduceRequest(mockRequest("test", {
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
			handlers.handleProduceRequest(mockRequest("test", {
				query: {
					ttl: "foo"
				}
			}), res)
			assert(res.status.calledWith(400))
		});

		it('returns 500 if there is an error producing to kafka', function (done) {
			kafka.send = sinon.stub().yields("error")
			handlers.handleProduceRequest(mockRequest("test"), res)
			setTimeout(function() {
				assert(res.status.calledWith(500))
				done()
			})
		});
		
	})

});