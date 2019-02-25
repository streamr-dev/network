const assert = require('assert')
const events = require('events')
const sinon = require('sinon')
const { StreamMessage, StreamMessageV30 } = require('streamr-client-protocol').MessageLayer
const Publisher = require('../../src/Publisher')
const MessageNotSignedError = require('../../src/errors/MessageNotSignedError')
const NotReadyError = require('../../src/errors/NotReadyError')

describe('Publisher', () => {
    const stream = {
        id: 'streamId',
        partitions: 10,
    }
    const signedStream = {
        requireSignedData: true,
    }

    const msg = {
        hello: 'world',
    }

    const streamMessageUnsigned = new StreamMessageV30(
        [stream.id, 0, Date.now(), 0, 'publisherId', '1'], [null, 0], StreamMessage.CONTENT_TYPES.JSON,
        msg, StreamMessage.SIGNATURE_TYPES.NONE, null,
    )

    let publisher
    let kafkaMock
    let partitionerMock

    beforeEach(() => {
        kafkaMock = new events.EventEmitter()
        kafkaMock.send = sinon.stub().resolves()
        partitionerMock = {
            partition: sinon.stub().returns(9),
        }

        publisher = new Publisher(kafkaMock, partitionerMock)
    })

    describe('publish', () => {
        it('should return a promise', () => {
            const promise = publisher.publish(stream, streamMessageUnsigned).catch(() => {})
            assert(promise instanceof Promise)
        })

        it('should throw FailedToPublishError if trying to publish before Kafka is ready', (done) => {
            publisher.publish(stream, streamMessageUnsigned).catch((err) => {
                assert(err instanceof NotReadyError, err)
                done()
            })
        })

        it('should throw MessageNotSignedError if trying to publish unsigned data on stream with requireSignedData flag', (done) => {
            publisher.publish(signedStream, streamMessageUnsigned).catch((err) => {
                assert(err instanceof MessageNotSignedError, err)
                done()
            })
        })

        describe('when kafka ready', () => {
            beforeEach(() => {
                kafkaMock.emit('ready')
            })

            it('should call KafkaUtil.send with a StreamMessage with correct values', (done) => {
                kafkaMock.send = (streamMessage) => {
                    assert(streamMessage instanceof StreamMessage)
                    assert.equal(streamMessage.getStreamId(), stream.id)
                    assert.equal(streamMessage.getStreamPartition(), 0)
                    assert.equal(streamMessage.getTimestamp(), streamMessageUnsigned.getTimestamp())
                    assert.equal(streamMessage.contentType, StreamMessage.CONTENT_TYPES.JSON)
                    assert.equal(streamMessage.getContent(), JSON.stringify(msg))
                    done()
                }
                publisher.publish(stream, streamMessageUnsigned)
            })
        })
    })
})
