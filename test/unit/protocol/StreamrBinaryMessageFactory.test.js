/* eslint-disable no-new */
const assert = require('assert')
const StreamrBinaryMessage = require('../../../src/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageFactory = require('../../../src/protocol/StreamrBinaryMessageFactory')
const StreamrBinaryMessageV28 = require('../../../src/protocol/StreamrBinaryMessageV29')
const StreamrBinaryMessageV29 = require('../../../src/protocol/StreamrBinaryMessageV29')
const StreamrBinaryMessageV30 = require('../../../src/protocol/StreamrBinaryMessageV30')

describe('StreamrBinaryMessageFactory', () => {
    const streamId = 'streamId'
    const streamPartition = 0
    const msg = {
        foo: 'bar',
    }
    const timestamp = Date.now()
    const sequenceNumber = 0
    const prevTimestamp = timestamp - 5
    const prevSequenceNumber = 0
    const ttl = 100

    const address = '0xf915ed664e43c50eb7b9ca7cfeb992703ede55c4'
    const signatureType = 1
    const signature = '0xcb1fa20f2f8e75f27d3f171d236c071f0de39e4b497c51b390306fc6e7e112bb415ecea1bd093320dd91fd91113748286711122548c52a15179822a014dc14931b'

    describe('fromBytes', () => {
        it('should call StreamrBinaryMessageV28.fromBytes', () => {
            const bytes = new StreamrBinaryMessageV28(
                streamId, streamPartition, timestamp, ttl,
                StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(JSON.stringify(msg), 'utf8'),
            ).toBytes()
            assert(StreamrBinaryMessageFactory.fromBytes(bytes) instanceof StreamrBinaryMessageV28)
        })
        it('should call StreamrBinaryMessageV29.fromBytes', () => {
            const bytes = new StreamrBinaryMessageV29(
                streamId, streamPartition, timestamp, ttl,
                StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(JSON.stringify(msg), 'utf8'), signatureType, address, signature,
            ).toBytes()
            assert(StreamrBinaryMessageFactory.fromBytes(bytes) instanceof StreamrBinaryMessageV29)
        })
        it('should call StreamrBinaryMessageV30.fromBytes', () => {
            const bytes = new StreamrBinaryMessageV30(
                streamId, streamPartition, timestamp, sequenceNumber, address, prevTimestamp, prevSequenceNumber, ttl,
                StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(JSON.stringify(msg), 'utf8'), signatureType, signature,
            ).toBytes()
            assert(StreamrBinaryMessageFactory.fromBytes(bytes) instanceof StreamrBinaryMessageV30)
        })
    })
})
