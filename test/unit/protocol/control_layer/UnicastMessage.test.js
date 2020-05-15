import assert from 'assert'

import ValidationError from '../../../../src/errors/ValidationError'
import { ControlLayer, MessageLayer } from '../../../../src/index'

const { StreamMessage } = MessageLayer
const { UnicastMessage, ControlMessage } = ControlLayer

describe('UnicastMessage', () => {
    describe('validation', () => {
        it('throws on null streamMessage', () => {
            assert.throws(() => new UnicastMessage(ControlMessage.LATEST_VERSION, 'requestId', null), ValidationError)
        })
        it('throws on bogus streamMessage', () => {
            assert.throws(() => new UnicastMessage(ControlMessage.LATEST_VERSION, 'requestId', {
                fake: true
            }), ValidationError)
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const streamMessage = StreamMessage.deserialize([30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature'])

            const msg = UnicastMessage.create('requestId', streamMessage)
            assert(msg instanceof UnicastMessage)
            assert(msg.streamMessage instanceof StreamMessage)
            assert.strictEqual(msg.requestId, 'requestId')
        })
    })
})
