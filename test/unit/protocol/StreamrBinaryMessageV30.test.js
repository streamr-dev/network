/* eslint-disable no-new */
const assert = require('assert')
const Protocol = require('streamr-client-protocol')
const sinon = require('sinon')
const BufferReader = require('buffer-reader')
const StreamrBinaryMessage = require('../../../src/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageV30 = require('../../../src/protocol/StreamrBinaryMessageV30')

describe('StreamrBinaryMessageV30', () => {
    let reader

    let version
    const streamId = 'streamId'
    const streamPartition = 0
    const timestamp = Date.now()
    const sequenceNumber = 0
    const publisherId = '0xf915ed664e43c50eb7b9ca7cfeb992703ede55c4'

    const prevTimestamp = timestamp - 5
    const prevSequenceNumber = 0

    const ttl = 100
    const msg = {
        foo: 'bar',
    }
    const signatureType = 1
    const signature = '0xcb1fa20f2f8e75f27d3f171d236c071f0de39e4b497c51b390306fc6e7e112bb415ecea1bd093320dd91fd91113748286711122548c52a15179822a014dc14931b'

    beforeEach(() => {
        version = 30
        const bytes = new StreamrBinaryMessageV30(
            streamId, streamPartition, timestamp, sequenceNumber, publisherId, prevTimestamp, prevSequenceNumber, ttl,
            StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(JSON.stringify(msg), 'utf8'), signatureType, signature,
        ).toBytes()
        reader = bytes instanceof BufferReader ? bytes : new BufferReader(bytes)
        reader.nextInt8() // Need to remove version byte before parsing.
    })

    describe('toBytes/fromBytes', () => {
        it('must not alter the field content', () => {
            const m = StreamrBinaryMessageV30.fromBytes(reader)
            assert.equal(m.version, version)
            assert.equal(m.streamId, streamId)
            assert.equal(m.streamPartition, streamPartition)
            assert.equal(m.timestamp, timestamp)
            assert.equal(m.sequenceNumber, sequenceNumber)
            assert.equal(m.publisherId, publisherId)
            assert.equal(m.prevTimestamp, prevTimestamp)
            assert.equal(m.prevSequenceNumber, prevSequenceNumber)
            assert.equal(m.ttl, ttl)
            assert.equal(m.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
            assert.deepEqual(m.getContentParsed(), msg)
            assert.equal(m.signatureType, signatureType)
            assert.equal(m.signature, signature)
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
                const m = StreamrBinaryMessageV30.fromBytes(reader)

                assert.equal(m.version, version)
                assert.equal(m.streamId, streamId)
                assert.equal(m.streamPartition, streamPartition)
                assert.equal(m.timestamp, timestamp)
                assert.equal(m.sequenceNumber, sequenceNumber)
                assert.equal(m.publisherId, publisherId)
                assert.equal(m.prevTimestamp, prevTimestamp)
                assert.equal(m.prevSequenceNumber, prevSequenceNumber)
                assert.equal(m.ttl, ttl)
                assert.equal(m.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
                assert(Buffer.isBuffer(m.content))
                assert.equal(m.signatureType, signatureType)
                assert.equal(m.signature, signature)

                // Since the content was passed as a buffer, it should remain as is on toBytes()
                m.toBytes()
                assert.equal(JSON.parse.callCount, 0)
                assert.equal(JSON.parse.callCount, 0)
            })
        })
    })
    describe('toStreamMessage', () => {
        it('correctly converts to StreamMessageV30', () => {
            const streamMessage = new StreamrBinaryMessageV30(
                streamId, streamPartition, timestamp, sequenceNumber, publisherId, prevTimestamp, prevSequenceNumber, ttl,
                StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(JSON.stringify(msg), 'utf8'), signatureType, signature,
            ).toStreamMessage()
            assert(streamMessage instanceof Protocol.MessageLayer.StreamMessageV30)
            assert.strictEqual(streamMessage.version, 30)
            assert.strictEqual(streamMessage.getStreamId(), streamId)
            assert.strictEqual(streamMessage.messageId.streamPartition, streamPartition)
            assert.strictEqual(streamMessage.messageId.timestamp, timestamp)
            assert.strictEqual(streamMessage.messageId.sequenceNumber, sequenceNumber)
            assert.strictEqual(streamMessage.messageId.publisherId, publisherId)
            assert.strictEqual(streamMessage.prevMessageRef.timestamp, prevTimestamp)
            assert.strictEqual(streamMessage.prevMessageRef.sequenceNumber, prevSequenceNumber)
            assert.strictEqual(streamMessage.ttl, ttl)
            assert.strictEqual(streamMessage.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
            assert.deepStrictEqual(streamMessage.getContent(true), msg)
            assert.strictEqual(streamMessage.signatureType, signatureType)
            assert.strictEqual(streamMessage.signature, signature)
        })
    })
})
