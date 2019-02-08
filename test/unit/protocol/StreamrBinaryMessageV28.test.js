/* eslint-disable no-new */
const assert = require('assert')
const sinon = require('sinon')
const BufferReader = require('buffer-reader')
const StreamrBinaryMessage = require('../../../src/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageV28 = require('../../../src/protocol/StreamrBinaryMessageV28')

describe('StreamrBinaryMessageV28', () => {
    let version
    const streamId = 'streamId'
    const streamPartition = 0
    const msg = {
        foo: 'bar',
    }
    const timestamp = Date.now()
    const ttl = 100

    let reader

    beforeEach(() => {
        version = 28
        const bytes = new StreamrBinaryMessageV28(
            streamId, streamPartition, timestamp, ttl,
            StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(JSON.stringify(msg), 'utf8'),
        ).toBytes()
        reader = bytes instanceof BufferReader ? bytes : new BufferReader(bytes)
        reader.nextInt8() // Need to remove version byte before parsing.
    })

    describe('toBytes/fromBytes', () => {
        it('must not alter the field content', () => {
            const m = StreamrBinaryMessageV28.fromBytes(reader)

            assert.equal(m.version, version)
            assert.equal(m.streamId, streamId)
            assert.equal(m.streamPartition, streamPartition)
            assert.equal(m.timestamp, timestamp)
            assert.equal(m.ttl, ttl)
            assert.equal(m.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
            assert.deepEqual(m.getContentParsed(), msg)
        })

        describe('with sinon spys on JSON object', () => {
            beforeEach(() => {
                sinon.spy(JSON, 'parse')
                sinon.spy(JSON, 'stringify')
            })

            afterEach(() => {
                JSON.parse.restore()
                JSON.stringify.restore()
            })

            it('must not parse the content with contentAsBuffer=true', () => {
                const m = StreamrBinaryMessageV28.fromBytes(reader)

                assert.equal(m.version, version)
                assert.equal(m.streamId, streamId)
                assert.equal(m.streamPartition, streamPartition)
                assert.equal(m.timestamp, timestamp)
                assert.equal(m.ttl, ttl)
                assert.equal(m.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
                assert(Buffer.isBuffer(m.content))

                // Since the content was passed as a buffer, it should remain as is on toBytes()
                m.toBytes()
                assert.equal(JSON.parse.callCount, 0)
                assert.equal(JSON.parse.callCount, 0)
            })
        })
    })

    describe('constructor', () => {
        it('must accept a buffer content', () => {
            new StreamrBinaryMessageV28(
                streamId, streamPartition, timestamp, ttl,
                StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(JSON.stringify(msg), 'utf8'),
            )
        })

        it('must accept a string content', () => {
            new StreamrBinaryMessageV28(
                streamId, streamPartition, timestamp, ttl,
                StreamrBinaryMessage.CONTENT_TYPE_JSON, 'I AM A STRING',
            )
        })

        it('must throw if content is not a buffer or a string', () => {
            assert.throws(() => {
                new StreamrBinaryMessageV28(
                    streamId, streamPartition, timestamp, ttl,
                    StreamrBinaryMessage.CONTENT_TYPE_JSON, {
                        iam: 'an object',
                    },
                )
            })
        })
    })
})
