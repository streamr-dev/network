const assert = require('assert')

const StreamrBinaryMessage = require('../../../src/protocol/StreamrBinaryMessage')
const StreamrBinaryMessageV28 = require('../../../src/protocol/StreamrBinaryMessageV28')
const StreamrBinaryMessageWithKafkaMetadata = require('../../../src/protocol/StreamrBinaryMessageWithKafkaMetadata')
const StreamrBinaryMessageBundle = require('../../../src/protocol/StreamrBinaryMessageBundle')

describe('StreamrBinaryMessageBundle', () => {
    const kafkaPartition = 0
    const streamId = 'streamId'
    const streamPartition = 0
    const content = {
        foo: 'bar',
    }
    const ttl = 100

    describe('version 0', () => {
        let streamrBinaryMessages
        let streamrBinaryMessagesWithKafkaMetadata
        let offset

        beforeEach(() => {
            offset = 0
            streamrBinaryMessages = []

            for (let i = 0; i < 10; i++) {
                streamrBinaryMessages.push(new StreamrBinaryMessageV28(
                    streamId, streamPartition, new Date(),
                    ttl, StreamrBinaryMessage.CONTENT_TYPE_JSON, Buffer.from(JSON.stringify(content), 'utf8'),
                ))
            }

            streamrBinaryMessagesWithKafkaMetadata = streamrBinaryMessages.map((streamrBinaryMessage) => {
                offset += 1
                return new StreamrBinaryMessageWithKafkaMetadata(streamrBinaryMessage, offset, offset - 1, kafkaPartition)
            })
        })

        describe('toBytes', () => {
            it('must return the correct bundle values', () => {
                const bundle = new StreamrBinaryMessageBundle(streamId, streamPartition)
                streamrBinaryMessagesWithKafkaMetadata.forEach((it) => {
                    bundle.add(it)
                })

                const byteData = bundle.toBytes()

                assert.equal(byteData.count, streamrBinaryMessagesWithKafkaMetadata.length)
                assert.equal(byteData.minOffset, streamrBinaryMessagesWithKafkaMetadata[0].offset)
                assert.equal(byteData.maxOffset, streamrBinaryMessagesWithKafkaMetadata[streamrBinaryMessagesWithKafkaMetadata.length - 1].offset)
                assert.equal(byteData.minTimestamp, streamrBinaryMessagesWithKafkaMetadata[0].getStreamrBinaryMessage().timestamp)
                assert.equal(
                    byteData.maxTimestamp,
                    streamrBinaryMessagesWithKafkaMetadata[streamrBinaryMessagesWithKafkaMetadata.length - 1]
                        .getStreamrBinaryMessage().timestamp,
                )
            })
        })

        describe('fromBytes', () => {
            it('must reconstruct the original messages', () => {
                const bundle = new StreamrBinaryMessageBundle(streamId, streamPartition)
                streamrBinaryMessagesWithKafkaMetadata.forEach((it) => {
                    bundle.add(it)
                })

                const byteData = bundle.toBytes()

                const arr = StreamrBinaryMessageBundle.fromBytes(byteData.bytes)
                assert.equal(arr.length, streamrBinaryMessagesWithKafkaMetadata.length)

                for (let i = 0; i < arr.length; i++) {
                    const a = streamrBinaryMessagesWithKafkaMetadata[i]
                    const b = arr[i]

                    assert.equal(a.offset, b.offset)
                    assert.equal(a.previousOffset, b.previousOffset)

                    assert.equal(a.getStreamrBinaryMessage().timestamp, b.getStreamrBinaryMessage().timestamp)
                    assert.deepEqual(a.getStreamrBinaryMessage().content, b.getStreamrBinaryMessage().content)
                }
            })
        })
    })
})
