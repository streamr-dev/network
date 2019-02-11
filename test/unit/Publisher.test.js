const assert = require('assert')
const events = require('events')
const sinon = require('sinon')
const BufferMaker = require('buffermaker')

const Publisher = require('../../src/Publisher')
const StreamrBinaryMessage = require('../../src/protocol/StreamrBinaryMessage')
const MessageNotSignedError = require('../../src/errors/MessageNotSignedError')
const InvalidMessageContentError = require('../../src/errors/InvalidMessageContentError')

describe('Publisher', () => {
    const stream = {
        id: 'streamId',
        partitions: 10,
    }
    const signedStream = {
        requireSignedData: true,
    }

    const msg = new BufferMaker().string('{}').make()

    let publisher
    let networkNode
    let partitionerMock

    beforeEach(() => {
        networkNode = new events.EventEmitter()
        networkNode.publish = sinon.stub().resolves()
        partitionerMock = {
            partition: sinon.stub().returns(9),
        }

        publisher = new Publisher(networkNode, partitionerMock)
    })

    describe('publish', () => {
        it('should return a promise', () => {
            const promise = publisher.publish(stream, Date.now(), msg).catch(() => {})
            assert(promise instanceof Promise)
        })

        it('should throw MessageNotSignedError if trying to publish unsigned data on stream with requireSignedData flag', (done) => {
            publisher.publish(signedStream, Date.now(), msg).catch((err) => {
                assert(err instanceof MessageNotSignedError, err)
                done()
            })
        })
        it('should throw InvalidMessageContentError if no content is given', (done) => {
            publisher.publish(stream, Date.now(), undefined).catch((err) => {
                assert(err instanceof InvalidMessageContentError)
                done()
            })
        })

        it('should call the partitioner with a partition key if given', () => {
            publisher.publish(stream, Date.now(), msg, 'key')
            assert(partitionerMock.partition.calledWith(stream.partitions, 'key'))
        })

        it('should call the partitioner with undefined partition key if not given', () => {
            publisher.publish(stream, Date.now(), msg)
            assert(partitionerMock.partition.calledWith(stream.partitions, undefined))
        })

        it('should call networkNode.send with correct values', (done) => {
            const timestamp = 135135135

            networkNode.publish = (streamId, streamPartition, ts, sequenceNo, publisherId, prevTs, previousSequenceNo, message) => {
                assert.equal(streamId, 'streamId')
                assert.equal(streamPartition, 9)
                assert.equal(ts, 135135135)
                assert.equal(sequenceNo, 0)
                assert.equal(publisherId, 'publisherId')
                assert.equal(prevTs, -1)
                assert.equal(previousSequenceNo, 0)
                assert.deepEqual(message, {
                    version: 29,
                    streamId: 'streamId',
                    partition: 9,
                    timestamp: 135135135,
                    ttl: 0,
                    address: undefined,
                    signature: undefined,
                    signatureType: 0,
                    contentType: 27,
                    content: {},

                })
                done()
            }
            publisher.publish(stream, timestamp, msg)
        })
    })
})
