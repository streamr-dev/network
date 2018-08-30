const assert = require('assert')
const events = require('events')
const sinon = require('sinon')
const BufferMaker = require('buffermaker')

const Publisher = require('../../src/Publisher')
const StreamrBinaryMessage = require('../../src/protocol/StreamrBinaryMessage')
const InvalidMessageContentError = require('../../src/errors/InvalidMessageContentError')
const NotReadyError = require('../../src/errors/NotReadyError')

describe('Publisher', () => {

    const stream = {
        id: 'streamId',
        partitions: 10,
    }

    const msg = new BufferMaker().string('{}').make()

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
            const promise = publisher.publish(stream, Date.now(), 0, StreamrBinaryMessage.CONTENT_TYPE_JSON, msg).catch(() => {})
            assert(promise instanceof Promise)
        })

        it('should throw FailedToPublishError if trying to publish before Kafka is ready', (done) => {
            publisher.publish(stream, Date.now(), 0, StreamrBinaryMessage.CONTENT_TYPE_JSON, msg).catch((err) => {
                assert(err instanceof NotReadyError, err)
                done()
            })
        })

        describe('when kafka ready', () => {
            beforeEach(() => {
                kafkaMock.emit('ready')
            })

            it('should throw InvalidMessageContentError if no content is given', (done) => {
                publisher.publish(stream, Date.now(), 0, StreamrBinaryMessage.CONTENT_TYPE_JSON, undefined).catch((err) => {
                    assert(err instanceof InvalidMessageContentError)
                    done()
                })
            })

            it('should call the partitioner with a partition key if given', () => {
                publisher.publish(stream, Date.now(), 0, StreamrBinaryMessage.CONTENT_TYPE_JSON, msg, 'key')
                assert(partitionerMock.partition.calledWith(stream.partitions, 'key'))
            })

            it('should call the partitioner with undefined partition key if not given', () => {
                publisher.publish(stream, Date.now(), 0, StreamrBinaryMessage.CONTENT_TYPE_JSON, msg)
                assert(partitionerMock.partition.calledWith(stream.partitions, undefined))
            })

            it('should call KafkaUtil.send with a StreamrBinaryMessage with correct values', (done) => {
                const timestamp = Date.now()
                const ttl = 1000

                kafkaMock.send = (streamrBinaryMessage) => {
                    assert(streamrBinaryMessage instanceof StreamrBinaryMessage)
                    assert.equal(streamrBinaryMessage.streamId, stream.id)
                    assert.equal(streamrBinaryMessage.streamPartition, partitionerMock.partition())
                    assert.equal(streamrBinaryMessage.timestamp, timestamp)
                    assert.equal(streamrBinaryMessage.ttl, ttl)
                    assert.equal(streamrBinaryMessage.contentType, StreamrBinaryMessage.CONTENT_TYPE_JSON)
                    assert.equal(streamrBinaryMessage.content, msg)
                    done()
                }
                publisher.publish(stream, timestamp, ttl, StreamrBinaryMessage.CONTENT_TYPE_JSON, msg)
            })

            it('should use default values for timestamp and ttl if not given', (done) => {
                kafkaMock.send = (streamrBinaryMessage) => {
                    assert(streamrBinaryMessage.timestamp > 0)
                    assert(streamrBinaryMessage.ttl === 0)
                    done()
                }
                publisher.publish(stream, undefined, undefined, StreamrBinaryMessage.CONTENT_TYPE_JSON, msg, 'key')
            })
        })
    })
})
