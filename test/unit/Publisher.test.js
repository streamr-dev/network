const assert = require('assert')
const events = require('events')
const sinon = require('sinon')
const { StreamMessage, StreamMessageV30 } = require('streamr-client-protocol').MessageLayer
const Publisher = require('../../src/Publisher')
const MessageNotSignedError = require('../../src/errors/MessageNotSignedError')

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
        [stream.id, 9, 135135135, 0, 'publisherId', '1'], [null, 0], StreamMessage.CONTENT_TYPES.JSON,
        msg, StreamMessage.SIGNATURE_TYPES.NONE, null,
    )

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
            const promise = publisher.publish(stream, streamMessageUnsigned).catch(() => {})
            assert(promise instanceof Promise)
        })

        it('should throw MessageNotSignedError if trying to publish unsigned data on stream with requireSignedData flag', (done) => {
            publisher.publish(signedStream, streamMessageUnsigned).catch((err) => {
                assert(err instanceof MessageNotSignedError, err)
                done()
            })
        })

        it('should call NetworkNode.send with correct values', (done) => {
            networkNode.publish = (streamId, streamPartition, ts, sequenceNo, publisherId, prevTs, previousSequenceNo, message) => {
                assert.equal(streamId, 'streamId')
                assert.equal(streamPartition, 9)
                assert.equal(ts, 135135135)
                assert.equal(sequenceNo, 0)
                assert.equal(publisherId, 'publisherId')
                assert.equal(prevTs, null)
                assert.equal(previousSequenceNo, 0)
                assert.deepEqual(message, {
                    hello: 'world',
                })
                done()
            }
            publisher.publish(stream, streamMessageUnsigned)
        })
    })
})
