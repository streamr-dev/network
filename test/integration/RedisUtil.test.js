const assert = require('assert')
const redis = require('redis')
const { StreamMessage, StreamMessageV30 } = require('streamr-client-protocol').MessageLayer

const RedisUtil = require('../../src/RedisUtil')

describe('RedisUtil', () => {
    const REDIS_HOST = '127.0.0.1'
    const REDIS_PASS = undefined

    let testRedisClient
    let redisHelper
    let streamId

    function streamMessage() {
        return new StreamMessageV30(
            [streamId, 1, 1488214484821, 0, 'publisherId', '1'], null,
            StreamMessage.CONTENT_TYPES.JSON, {
                hello: 'world',
            }, StreamMessage.SIGNATURE_TYPES.NONE, null,
        )
    }

    function streamMessageSigned() {
        return new StreamMessageV30(
            [streamId, 1, 1488214484821, 0, '0xf915ed664e43c50eb7b9ca7cfeb992703ede55c4', '1'], null,
            StreamMessage.CONTENT_TYPES.JSON, {
                hello: 'world',
            }, StreamMessage.SIGNATURE_TYPES.ETH,
            '0xcb1fa20f2f8e75f27d3f171d236c071f0de39e4b497c51b390306fc6e7e112bb415ecea1bd093320dd91fd91113748286711122548c52a15179822a014dc14931b',
        )
    }

    beforeEach((done) => {
        streamId = `RedisUtil.test.js-${Date.now()}`

        testRedisClient = redis.createClient({
            host: REDIS_HOST, password: REDIS_PASS,
        })
        redisHelper = new RedisUtil([REDIS_HOST], REDIS_PASS, done)
    })

    afterEach(() => {
        redisHelper.quit()
        testRedisClient.quit()
    })

    describe('after instantiating with a single host and password', () => {
        it('has no subscriptions entries', () => {
            assert.deepEqual(redisHelper.subscriptions, {})
        })

        it('has single clientsByHost entry', () => {
            assert.deepEqual(Object.keys(redisHelper.clientsByHost), [REDIS_HOST])
        })
    })

    describe('subscribe', () => {
        it('creates subscription entry', (done) => {
            redisHelper.subscribe(streamId, 1, () => {
                assert.deepEqual(redisHelper.subscriptions, {
                    [`${streamId}-1`]: true,
                })
                done()
            })
        })
    })

    describe('unsubscribe', () => {
        it('removes subscription entry', (done) => {
            redisHelper.subscribe(streamId, 1, () => {
                assert.equal(Object.keys(redisHelper.subscriptions).length, 1)

                redisHelper.unsubscribe(streamId, 1, () => {
                    assert.deepEqual(redisHelper.subscriptions, {})
                    done()
                })
            })
        })
    })

    describe('after subscribing', () => {
        beforeEach((done) => {
            redisHelper.subscribe(streamId, 1, done)
        })

        it('emits a "message" event when receiving data from Redis', (done) => {
            const m = streamMessage()

            redisHelper.on('message', (msg) => {
                assert.deepEqual(msg, m)
                done()
            })

            testRedisClient.publish(`${streamId}-1`, Buffer.from(m.serialize()))
        })

        it('emits a signed "message" event when receiving data from Redis', (done) => {
            const m = streamMessageSigned()

            redisHelper.on('message', (msg) => {
                assert.deepEqual(msg, m)
                done()
            })

            testRedisClient.publish(`${streamId}-1`, Buffer.from(m.serialize()))
        })

        it('does not emit a "message" event for a message sent to another Redis channel', (done) => {
            redisHelper.on('message', (msg) => {
                throw new Error(`Should not have received message: ${msg}`)
            })

            testRedisClient.publish(`${streamId}-2`, Buffer.from(streamMessage().serialize()), () => {
                setTimeout(done, 500)
            })
        })
    })

    describe('after subscribing and unsubscribing', () => {
        beforeEach((done) => {
            redisHelper.subscribe(streamId, 1, () => {
                redisHelper.unsubscribe(streamId, 1, done)
            })
        })

        it('does not emit a "message" event when receiving data from Redis', (done) => {
            redisHelper.on('message', (msg) => {
                throw new Error(`Should not have received message: ${msg}`)
            })

            testRedisClient.publish(`${streamId}-1`, Buffer.from(streamMessage().serialize()), () => {
                setTimeout(done, 500)
            })
        })

        describe('after (re)subscribing', () => {
            beforeEach((done) => {
                redisHelper.subscribe(streamId, 1, done)
            })

            it('emits a "message" event when receiving data from Redis', (done) => {
                const m = streamMessage()

                testRedisClient.publish(`${streamId}-1`, Buffer.from(m.serialize()))
                redisHelper.on('message', (msg) => {
                    assert.deepEqual(msg, m)
                    done()
                })
            })
        })
    })
})
