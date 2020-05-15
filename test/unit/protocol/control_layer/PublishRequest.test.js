import assert from 'assert'

import ValidationError from '../../../../src/errors/ValidationError'
import { ControlLayer, MessageLayer } from '../../../../src/index'

const { StreamMessage } = MessageLayer
const { PublishRequest, ControlMessage } = ControlLayer

describe('PublishRequest', () => {
    const streamMessage = StreamMessage.deserialize([30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
        [1529549961000, 0], StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature'])

    describe('validation', () => {
        it('throws on null streamMessage', () => {
            assert.throws(() => new PublishRequest(ControlMessage.LATEST_VERSION, 'requestId', null, 'sessionToken'), ValidationError)
        })
        it('throws on invalid sessionToken', () => {
            assert.throws(() => new PublishRequest(ControlMessage.LATEST_VERSION, 'requestId', streamMessage, 123), ValidationError)
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const msg = PublishRequest.create('requestId', streamMessage, 'sessionToken')
            assert(msg instanceof PublishRequest)
            assert(msg.version = ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamMessage, streamMessage)
            assert.strictEqual(msg.sessionToken, 'sessionToken')
        })
    })
})
