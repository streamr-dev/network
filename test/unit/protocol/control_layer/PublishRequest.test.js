import assert from 'assert'
import PublishRequest from '../../../../src/protocol/control_layer/publish_request/PublishRequest'
import PublishRequestV1 from '../../../../src/protocol/control_layer/publish_request/PublishRequestV1'
import UnsupportedVersionError from '../../../../src/errors/UnsupportedVersionError'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageFactory from '../../../../src/protocol/message_layer/StreamMessageFactory'

describe('PublishRequest', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const streamMsg = StreamMessageFactory.deserialize([30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'], [1529549961000, 0],
                StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature'])
            const msg = PublishRequest.create(streamMsg, 'sessionToken')
            assert(msg instanceof PublishRequestV1)
            assert(msg.streamMessage instanceof StreamMessage)
            assert.strictEqual(msg.sessionToken, 'sessionToken')
        })
    })
})
