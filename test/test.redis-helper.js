const assert = require('assert')
const sinon = require('sinon')
const redis = require('redis')

const RedisHelper = require('../lib/redis-helper')

describe('RedisHelper', function() {

	const REDIS_HOST = "127.0.0.1"
	const REDIS_PASS = "kakka"

	var testRedisClient
	var redisHelper

	beforeEach(function() {
		testRedisClient = redis.createClient({ host: REDIS_HOST, password: REDIS_PASS })
		redisHelper = new RedisHelper([REDIS_HOST], REDIS_PASS)
	})

	afterEach(function() {
		testRedisClient.del("stream-1-0")
		testRedisClient.quit()
	})

	describe('fetchOffset', function() {
		it("returns null if key doesn't exist", function(done) {
			redisHelper.fetchOffset("stream-1", 0, function(result) {
				assert.equal(result, null)
				done()
			});
		})

		it("returns value if key exists", function(done) {
			testRedisClient.setex("stream-1-0", 10, "2487679201527")
			redisHelper.fetchOffset("stream-1", 0, function(result) {
				assert.equal(result, 2487679201527)
				done()
			});
		})
	})
})