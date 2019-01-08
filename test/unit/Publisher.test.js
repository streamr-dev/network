const assert = require('assert')
const events = require('events')
const sinon = require('sinon')
const BufferMaker = require('buffermaker')

const Publisher = require('../../src/Publisher')
const StreamrBinaryMessage = require('../../src/protocol/StreamrBinaryMessage')
const InvalidMessageContentError = require('../../src/errors/InvalidMessageContentError')

describe('Publisher', () => {
    const stream = {
        id: 'streamId',
        partitions: 10,
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

            networkNode.publish = (streamId, streamPartition, ts, sequenceNo, publisherId, prevTs, previousSequenceNo, protocolMessage) => {
                assert.equal(streamId, 'streamId')
                assert.equal(streamPartition, 9)
                assert.equal(ts, 135135135)
                assert.equal(sequenceNo, 0)
                assert.equal(publisherId, 'publisherId')
                assert.equal(prevTs, -1)
                assert.equal(previousSequenceNo, 0)
                assert.deepEqual(protocolMessage, [28, 'streamId', 9, 135135135, 0, null, null, 27, '{}'])
                done()
            }
            publisher.publish(stream, timestamp, msg)
        })

        it('should use default values for timestamp if not given', (done) => {
            networkNode.publish = (streamId, streamPartition, ts, sequenceNo, publisherId, prevTs, previousSequenceNo, protocolMessage) => {
                assert(ts > 0) // timestamp
                assert(protocolMessage[3] > 0) // timestamp
                done()
            }
            publisher.publish(stream, undefined, msg, 'key')
        })
    })
})
