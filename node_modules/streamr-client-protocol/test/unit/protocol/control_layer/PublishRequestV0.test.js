import assert from 'assert'
import PublishRequestV0 from '../../../../src/protocol/control_layer/publish_request/PublishRequestV0'
import StreamMessageV30 from '../../../../src/protocol/message_layer/StreamMessageV30'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'

describe('PublishRequestV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                type: 'publish',
                stream: 'streamId',
                authKey: 'authKey',
                sessionToken: 'sessionToken',
                msg: JSON.stringify({
                    foo: 'bar',
                }),
                ts: 1533924184016,
                pkey: 'deviceId',
                addr: 'publisherAddress',
                sigtype: StreamMessage.SIGNATURE_TYPES.ETH,
                sig: 'signature',
            }
            const result = new PublishRequestV0(...PublishRequestV0.getConstructorArgs(msg))
            assert.equal(result.streamId, msg.stream)
            assert.equal(result.apiKey, msg.authKey)
            assert.equal(result.sessionToken, msg.sessionToken)
            assert.equal(result.content, msg.msg)
            assert.equal(result.timestamp, msg.ts)
            assert.equal(result.partitionKey, msg.pkey)
            assert.equal(result.publisherAddress, msg.addr)
            assert.equal(result.signatureType, msg.sigtype)
            assert.equal(result.signature, msg.sig)
            assert(result.getStreamMessage(1) instanceof StreamMessageV30)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                type: 'publish',
                stream: 'streamId',
                authKey: 'authKey',
                sessionToken: 'sessionToken',
                msg: '{}',
                ts: 1533924184016,
                pkey: 'deviceId',
                addr: 'publisherAddress',
                sigtype: StreamMessage.SIGNATURE_TYPES.ETH,
                sig: 'signature',
            }

            const serialized = new PublishRequestV0(
                'streamId',
                'authKey',
                'sessionToken',
                {},
                1533924184016,
                'deviceId',
                'publisherAddress',
                StreamMessage.SIGNATURE_TYPES.ETH,
                'signature',
            ).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
    describe('getStreamMessage', () => {
        it('correctly builds a stream message version 30', () => {
            const req = new PublishRequestV0(
                'streamId',
                'authKey',
                'sessionToken',
                {},
                1533924184016,
                'deviceId',
                'publisherAddress',
                StreamMessage.SIGNATURE_TYPES.ETH,
                'signature',
            )
            const msg = req.getStreamMessage(0)
            assert.equal(msg.getStreamId(), 'streamId')
            assert.equal(msg.getStreamPartition(), 0)
            assert.equal(msg.getTimestamp(), 1533924184016)
            assert.equal(msg.messageId.sequenceNumber, 0)
            assert.equal(msg.getPublisherId(), 'publisherAddress')
            assert.equal(msg.messageId.msgChainId, '')
            assert.equal(msg.prevMsgRef, null)
            assert.equal(msg.contentType, 27)
            assert.equal(msg.serializedContent, '{}')
            assert.equal(msg.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
            assert.equal(msg.signature, 'signature')
        })
        it('correctly builds a stream message version 30 (default values)', () => {
            const json = {
                type: 'publish',
                stream: 'streamId',
                authKey: 'authKey',
                sessionToken: 'sessionToken',
                msg: JSON.stringify({
                    foo: 'bar',
                }),
            }
            const req = new PublishRequestV0(...PublishRequestV0.getConstructorArgs(json))
            const msg = req.getStreamMessage(0)
            assert.equal(msg.getStreamId(), 'streamId')
            assert.equal(msg.getStreamPartition(), 0)
            assert(msg.getTimestamp())
            assert.equal(msg.messageId.sequenceNumber, 0)
            assert.equal(msg.getPublisherId(), '')
            assert.equal(msg.messageId.msgChainId, '')
            assert.equal(msg.signatureType, StreamMessage.SIGNATURE_TYPES.NONE)
            assert.equal(msg.signature, null)
        })
    })
})
