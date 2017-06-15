const assert = require('assert')
const sinon = require('sinon')
const redis = require('redis')

const RedisHelper = require('../lib/redis-helper')
const StreamrBinaryMessage = require('../lib/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../lib/protocol/StreamrBinaryMessageWithKafkaMetadata')

describe('RedisHelper', function() {

	const REDIS_HOST = '127.0.0.1'
	const REDIS_PASS = 'kakka'

	var testRedisClient
	var redisHelper

	function streamrMessage() {
		var msg = new StreamrBinaryMessage('streamId', 1, 1488214484821, 0,
			StreamrBinaryMessage.CONTENT_TYPE_JSON, new Buffer(JSON.stringify({hello: 'world'}), 'utf8'))
		return new StreamrBinaryMessageWithKafkaMetadata(msg, 0, null, 0)
	}

	beforeEach(function(done) {
		testRedisClient = redis.createClient({ host: REDIS_HOST, password: REDIS_PASS })
		redisHelper = new RedisHelper([REDIS_HOST], REDIS_PASS, done)
	})

	afterEach(function() {
		redisHelper.quit()
		testRedisClient.quit()
	})

	context('after instantiating with a single host and password', function() {
		it('has no subscriptions entries', function() {
			assert.deepEqual(redisHelper.subscriptions, {})
		})

		it('has single clientsByHost entry', function() {
			assert.deepEqual(Object.keys(redisHelper.clientsByHost), [REDIS_HOST])
		})
	})

	describe('subscribe', function() {
		it('creates subscription entry', function(done) {
			redisHelper.subscribe('streamId', 1, function() {
				assert.deepEqual(redisHelper.subscriptions, { 'streamId-1': true })
				done()
			})
		})
	})

	describe('unsubscribe', function() {
		it('removes subscription entry', function(done) {
			redisHelper.subscribe('streamId', 1, function() {
				assert.equal(Object.keys(redisHelper.subscriptions).length, 1)
				
				redisHelper.unsubscribe('streamId', 1, function () {
					assert.deepEqual(redisHelper.subscriptions, {})
					done()
				})
			})
		})
	})

	context('after subscribing', function() {
		beforeEach(function(done) {
			redisHelper.subscribe('streamId', 1, done)
		})

		it('emits a "message" event when receiving data from Redis', function(done) {
			var m = streamrMessage()

			testRedisClient.publish('streamId-1', m.toBytes())
			redisHelper.on('message', function(msg) {
				assert.deepEqual(msg, m.toArray())
				done()
			})
		})

		it('does not emit a "message" event for a message sent to another Redis channel', function(done) {
			redisHelper.on('message', function(msg) {
				throw "Should not have received message: " + msg
			})

			testRedisClient.publish('streamId-2', streamrMessage().toBytes(), function() {
				setTimeout(done, 500)
			})
		})
	})
	
	context('after subscribing and unsubscribing', function() {
		beforeEach(function(done) {
			redisHelper.subscribe('streamId', 1, function() {
				redisHelper.unsubscribe('streamId', 1, done)
			})
		})

		it('does not emits a "message" event when receiving data from Redis', function(done) {
			redisHelper.on('message', function(msg) {
				throw "Should not have received message: " + msg
			})

			testRedisClient.publish('streamId-1', streamrMessage().toBytes(), function() {
				setTimeout(done, 500)
			})
		})

		context('after (re)subscribing', function() {
			beforeEach(function(done) {
				redisHelper.subscribe('streamId', 1, done)
			})

			it('emits a "message" event when receiving data from Redis', function(done) {
				var m = streamrMessage()

				testRedisClient.publish('streamId-1', m.toBytes())
				redisHelper.on('message', function(msg) {
					assert.deepEqual(msg, m.toArray())
					done()
				})
			})
		})
	})
})