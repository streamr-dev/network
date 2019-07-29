import assert from 'assert'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageV31 from '../../../../src/protocol/message_layer/StreamMessageV31'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'

describe('StreamMessage', () => {
    describe('from', () => {
        it('create a StreamMessageV31 with previous timestamp and sequence number', () => {
            const streamMessage = StreamMessage.from({
                streamId: 'streamId',
                streamPartition: 0,
                timestamp: 1564046332168,
                sequenceNumber: 10,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                previousTimestamp: 1564046132168,
                previousSequenceNumber: 5,
                contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                content: {
                    hello: 'world',
                },
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })
            assert(streamMessage instanceof StreamMessageV31)
            assert.equal(streamMessage.getStreamId(), 'streamId')
            assert.equal(streamMessage.getStreamPartition(), 0)
            assert.equal(streamMessage.getTimestamp(), 1564046332168)
            assert.equal(streamMessage.getSequenceNumber(), 10)
            assert.equal(streamMessage.getPublisherId(), 'publisherId')
            assert.equal(streamMessage.getMsgChainId(), 'msgChainId')
            assert.deepEqual(streamMessage.prevMsgRef, new MessageRef(1564046132168, 5))
            assert.equal(streamMessage.contentType, StreamMessage.CONTENT_TYPES.MESSAGE)
            assert.equal(streamMessage.encryptionType, StreamMessage.ENCRYPTION_TYPES.NONE)
            assert.equal(streamMessage.getContent(), '{"hello":"world"}')
            assert.equal(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
            assert.equal(streamMessage.signature, 'signature')
        })

        it('create StreamMessageV31 without previous timestamp and sequence number', () => {
            const streamMessage = StreamMessage.from({
                streamId: 'streamId',
                streamPartition: 0,
                timestamp: 1564046332168,
                sequenceNumber: 10,
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                previousTimestamp: null,
                previousSequenceNumber: null,
                contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                content: {
                    hello: 'world',
                },
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: 'signature',
            })
            assert(streamMessage instanceof StreamMessageV31)
            assert.equal(streamMessage.getStreamId(), 'streamId')
            assert.equal(streamMessage.getStreamPartition(), 0)
            assert.equal(streamMessage.getTimestamp(), 1564046332168)
            assert.equal(streamMessage.getSequenceNumber(), 10)
            assert.equal(streamMessage.getPublisherId(), 'publisherId')
            assert.equal(streamMessage.getMsgChainId(), 'msgChainId')
            assert.equal(streamMessage.prevMsgRef, null)
            assert.equal(streamMessage.contentType, StreamMessage.CONTENT_TYPES.MESSAGE)
            assert.equal(streamMessage.encryptionType, StreamMessage.ENCRYPTION_TYPES.NONE)
            assert.equal(streamMessage.getContent(), '{"hello":"world"}')
            assert.equal(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
            assert.equal(streamMessage.signature, 'signature')
        })
    })
})
