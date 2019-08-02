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
        [stream.id, stream.partitions, 135135135, 0, 'publisherId', 'msgChainId'],
        null,
        StreamMessage.CONTENT_TYPES.MESSAGE,
        msg,
        StreamMessage.SIGNATURE_TYPES.NONE,
        null,
    )

    let publisher
    let networkNode

    beforeEach(() => {
        networkNode = new events.EventEmitter()
        networkNode.publish = sinon.stub().resolves()
        publisher = new Publisher(networkNode)
    })

    describe('publish', () => {
        it('throws MessageNotSignedError if trying to publish unsigned data on stream with requireSignedData', () => {
            expect(() => publisher.publish(signedStream, streamMessageUnsigned)).toThrow(MessageNotSignedError)
        })

        it('should call NetworkNode.publish with correct values', (done) => {
            networkNode.publish = (streamMessage) => {
                expect(streamMessage).toEqual(streamMessageUnsigned)
                done()
            }
            publisher.publish(stream, streamMessageUnsigned)
        })
    })
})
