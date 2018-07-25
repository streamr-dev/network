const assert = require('assert')
const redis = require('redis')

const RedisOffsetFetcher = require('../../src/RedisOffsetFetcher')

describe('RedisOffsetFetcher', () => {
    const REDIS_HOST = '127.0.0.1'
    const REDIS_PASS = undefined

    let testRedisClient
    let redisOffsetFetcher

    beforeEach(() => {
        testRedisClient = redis.createClient({
            host: REDIS_HOST,
        })
        redisOffsetFetcher = new RedisOffsetFetcher(REDIS_HOST, REDIS_PASS)
    })

    afterEach(() => {
        testRedisClient.del('stream-1-0')
        testRedisClient.quit()
    })

    describe('fetchOffset', () => {
        it("returns null if key doesn't exist", () => redisOffsetFetcher.fetchOffset('stream-1', 0).then((value) => {
            assert.equal(value, null)
        }))

        it('returns value if key exists', (done) => {
            testRedisClient.setex('stream-1-0', 15, '2487679201527', (err) => {
                if (err) {
                    done(err)
                }
                return redisOffsetFetcher.fetchOffset('stream-1', 0).then((value) => {
                    assert.equal(value, 2487679201527)
                    done()
                })
            })
        })
    })
})
