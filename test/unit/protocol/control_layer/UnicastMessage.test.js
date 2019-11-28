import assert from 'assert'
import UnicastMessage from '../../../../src/protocol/control_layer/unicast_message/UnicastMessage'
import UnicastMessageV1 from '../../../../src/protocol/control_layer/unicast_message/UnicastMessageV1'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageFactory from '../../../../src/protocol/message_layer/StreamMessageFactory'

describe('UnicastMessage', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const streamMessage = StreamMessageFactory.deserialize([30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature'])
            const msg = UnicastMessage.create('requestId', streamMessage)
            assert(msg instanceof UnicastMessageV1)
            assert(msg.streamMessage instanceof StreamMessage)
            assert.strictEqual(msg.requestId, 'requestId')
        })
    })
})
