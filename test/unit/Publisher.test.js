const events = require('events')

const sinon = require('sinon')
const { StreamMessage, StreamMessageV30 } = require('streamr-client-protocol').MessageLayer

const Publisher = require('../../src/Publisher')
const { MessageNotSignedError, MessageNotEncryptedError } = require('../../src/errors/MessageNotSignedError')

describe('Publisher', () => {
    const stream = {
        id: 'streamId',
        partitions: 10
    }

    const signedStream = {
        requireSignedData: true
    }

    const encryptedStream = {
        requireEncryptedData: true
    }

    const msg = {
        hello: 'world'
    }

    const streamMessageUnsignedUnencrypted = new StreamMessageV30(
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
            expect(() => publisher.publish(signedStream, streamMessageUnsignedUnencrypted)).toThrow(MessageNotSignedError)
        })

        it('throws MessageNotEncryptedError if trying to publish not encrypted data on stream with encryptedStream', () => {
            expect(() => publisher.publish(encryptedStream, streamMessageUnsignedUnencrypted)).toThrow(MessageNotEncryptedError)
        })

        it('should call NetworkNode.publish with correct values', (done) => {
            networkNode.publish = (streamMessage) => {
                expect(streamMessage).toEqual(streamMessageUnsignedUnencrypted)
                done()
            }
            expect(() => publisher.publish(stream, streamMessageUnsignedUnencrypted)).not.toThrow()
        })
    })
})
