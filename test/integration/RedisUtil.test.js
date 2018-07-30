const assert = require('assert')
const redis = require('redis')

const RedisUtil = require('../../src/RedisUtil')
const StreamrBinaryMessage = require('../../src/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../../src/protocol/StreamrBinaryMessageWithKafkaMetadata')

describe('RedisUtil', () => {
    const REDIS_HOST = '127.0.0.1'
    const REDIS_PASS = undefined

    let testRedisClient
    let redisHelper

    function streamrMessage() {
        const msg = new StreamrBinaryMessage(
            'streamId', 1, 1488214484821, 0,
            StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(JSON.stringify({
                hello: 'world',
            }), 'utf8'),
        )
        return new StreamrBinaryMessageWithKafkaMetadata(msg, 0, null, 0)
    }

    beforeEach((done) => {
        testRedisClient = redis.createClient({
            host: REDIS_HOST, password: REDIS_PASS,
        })
        redisHelper = new RedisUtil([REDIS_HOST], REDIS_PASS, done)
    })

    afterEach(() => {
        redisHelper.quit()
        testRedisClient.quit()
    })

    context('after instantiating with a single host and password', () => {
        it('has no subscriptions entries', () => {
            assert.deepEqual(redisHelper.subscriptions, {})
        })

        it('has single clientsByHost entry', () => {
            assert.deepEqual(Object.keys(redisHelper.clientsByHost), [REDIS_HOST])
        })
    })

    describe('subscribe', () => {
        it('creates subscription entry', (done) => {
            redisHelper.subscribe('streamId', 1, () => {
                assert.deepEqual(redisHelper.subscriptions, {
                    'streamId-1': true,
                })
                done()
            })
        })
    })

    describe('unsubscribe', () => {
        it('removes subscription entry', (done) => {
            redisHelper.subscribe('streamId', 1, () => {
                assert.equal(Object.keys(redisHelper.subscriptions).length, 1)

                redisHelper.unsubscribe('streamId', 1, () => {
                    assert.deepEqual(redisHelper.subscriptions, {})
                    done()
                })
            })
        })
    })

    context('after subscribing', () => {
        beforeEach((done) => {
            redisHelper.subscribe('streamId', 1, done)
        })

        it('emits a "message" event when receiving data from Redis', (done) => {
            const m = streamrMessage()

            testRedisClient.publish('streamId-1', m.toBytes())
            redisHelper.on('message', (msg) => {
                assert.deepEqual(msg, m.toArray())
                done()
            })
        })

        it('does not emit a "message" event for a message sent to another Redis channel', (done) => {
            redisHelper.on('message', (msg) => {
                throw new Error(`Should not have received message: ${msg}`)
            })

            testRedisClient.publish('streamId-2', streamrMessage().toBytes(), () => {
                setTimeout(done, 500)
            })
        })
    })

    context('after subscribing and unsubscribing', () => {
        beforeEach((done) => {
            redisHelper.subscribe('streamId', 1, () => {
                redisHelper.unsubscribe('streamId', 1, done)
            })
        })

        it('does not emit a "message" event when receiving data from Redis', (done) => {
            redisHelper.on('message', (msg) => {
                throw new Error(`Should not have received message: ${msg}`)
            })

            testRedisClient.publish('streamId-1', streamrMessage().toBytes(), () => {
                setTimeout(done, 500)
            })
        })

        context('after (re)subscribing', () => {
            beforeEach((done) => {
                redisHelper.subscribe('streamId', 1, done)
            })

            it('emits a "message" event when receiving data from Redis', (done) => {
                const m = streamrMessage()

                testRedisClient.publish('streamId-1', m.toBytes())
                redisHelper.on('message', (msg) => {
                    assert.deepEqual(msg, m.toArray())
                    done()
                })
            })
        })
    })
})
