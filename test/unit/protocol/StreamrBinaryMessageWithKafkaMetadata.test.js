const assert = require('assert')
const sinon = require('sinon')
const StreamrBinaryMessage = require('../../../src/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageWithKafkaMetadata = require('../../../src/protocol/StreamrBinaryMessageWithKafkaMetadata')

describe('StreamrBinaryMessageWithKafkaMetadata', () => {
    describe('version 0', () => {
        let msg
        let msgWithMetadata

        beforeEach(() => {
            const streamId = 'streamId'
            const streamPartition = 0
            const timestamp = 1497529459457
            const ttl = 100
            const content = Buffer.from('{"foo":"bar"}', 'utf8')
            const offset = 100
            const previousOffset = 99
            const kafkaPartition = 0

            msg = new StreamrBinaryMessage(
                streamId,
                streamPartition,
                timestamp,
                ttl,
                StreamrBinaryMessage.CONTENT_TYPE_JSON,
                content,
            )

            msgWithMetadata = new StreamrBinaryMessageWithKafkaMetadata(msg, offset, previousOffset, kafkaPartition)
        })

        describe('toBytes/fromBytes', () => {
            it('encodes/decodes message fields properly', () => {
                const msgAsBytes = msgWithMetadata.toBytes()
                const rebuiltMsg = StreamrBinaryMessageWithKafkaMetadata.fromBytes(msgAsBytes)

                assert.equal(rebuiltMsg.version, 0)
                assert.equal(rebuiltMsg.offset, 100)
                assert.equal(rebuiltMsg.previousOffset, 99)
            })

            it('support undefined previousOffset', () => {
                const msgAsBytes = new StreamrBinaryMessageWithKafkaMetadata(msg, 100, undefined, 0).toBytes()
                const rebuiltMsg = StreamrBinaryMessageWithKafkaMetadata.fromBytes(msgAsBytes)

                assert.equal(rebuiltMsg.previousOffset, undefined)
            })

            it('keeps wrapped StreamrBinaryMessage untouched', () => {
                const msgAsBytes = msgWithMetadata.toBytes()
                const rebuiltMsg = StreamrBinaryMessageWithKafkaMetadata.fromBytes(msgAsBytes).getStreamrBinaryMessage()

                assert.deepEqual(rebuiltMsg, msg)
            })

            describe('optimisation', () => {
                beforeEach(() => {
                    sinon.spy(StreamrBinaryMessage, 'fromBytes')
                })

                afterEach(() => {
                    StreamrBinaryMessage.fromBytes.restore()
                })

                it('does not call StreamrBinaryMessage.fromBytes() when StreamrBinaryMessage passed as buffer when toBytes', () => {
                    const msgAsBytes = new StreamrBinaryMessageWithKafkaMetadata(msg.toBytes(), 100, 99, 0)
                    msgAsBytes.toBytes()

                    assert.equal(StreamrBinaryMessage.fromBytes.callCount, 0)
                })
            })
        })

        describe('toArray(contentAsBuffer)', () => {
            it('returns data in array format given contentAsBuffer=true', () => {
                assert.deepEqual(msgWithMetadata.toArray(true), [
                    28,
                    'streamId',
                    0,
                    1497529459457,
                    100,
                    100,
                    99,
                    StreamrBinaryMessage.CONTENT_TYPE_JSON,
                    '{"foo":"bar"}',
                ])
            })

            it('returns data in array format with pre-parsed content contentAsBuffer=false', () => {
                assert.deepEqual(msgWithMetadata.toArray(false), [
                    28,
                    'streamId',
                    0,
                    1497529459457,
                    100,
                    100,
                    99,
                    StreamrBinaryMessage.CONTENT_TYPE_JSON,
                    {
                        foo: 'bar',
                    },
                ])
            })
        })

        describe('toObject(contentAsBuffer)', () => {
            it('returns data in object format given contentAsBuffer=true', () => {
                assert.deepEqual(msgWithMetadata.toObject(true), {
                    version: 28,
                    streamId: 'streamId',
                    partition: 0,
                    timestamp: 1497529459457,
                    ttl: 100,
                    offset: 100,
                    previousOffset: 99,
                    contentType: StreamrBinaryMessage.CONTENT_TYPE_JSON,
                    content: '{"foo":"bar"}',
                })
            })

            it('returns data in object format with pre-parsed content contentAsBuffer=false', () => {
                assert.deepEqual(msgWithMetadata.toObject(false), {
                    version: 28,
                    streamId: 'streamId',
                    partition: 0,
                    timestamp: 1497529459457,
                    ttl: 100,
                    offset: 100,
                    previousOffset: 99,
                    contentType: StreamrBinaryMessage.CONTENT_TYPE_JSON,
                    content: {
                        foo: 'bar',
                    },
                })
            })
        })
    })
})
