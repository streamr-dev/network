const assert = require('assert')
const redis = require('redis')

const RedisOffsetFetcher = require('../../src/RedisOffsetFetcher')

describe('RedisOffsetFetcher', () => {
    const REDIS_HOST = '127.0.0.1'
    const REDIS_PASS = undefined

    let testRedisClient
    let redisOffsetFetcher
    let streamId
    let streamIdWithPartition

    beforeEach(() => {
        streamId = `RedisOffsetFetcher.test.js-${Date.now()}`
        streamIdWithPartition = `${streamId}-0`

        testRedisClient = redis.createClient({
            host: REDIS_HOST,
        })
        redisOffsetFetcher = new RedisOffsetFetcher(REDIS_HOST, REDIS_PASS)
    })

    afterEach(() => {
        testRedisClient.del(streamId)
        testRedisClient.quit()
        redisOffsetFetcher.close()
    })

    describe('fetchOffset', () => {
        it("returns null if key doesn't exist", () => redisOffsetFetcher.fetchOffset('non-existent-id', 0).then((value) => {
            assert.equal(value, null)
        }))

        it('returns value if key exists', (done) => {
            testRedisClient.setex(streamIdWithPartition, 15, '2487679201527', (err) => {
                if (err) {
                    done(err)
                }
                return redisOffsetFetcher.fetchOffset(streamId, 0).then((value) => {
                    assert.equal(value, 2487679201527)
                    done()
                })
            })
        })
    })
})
