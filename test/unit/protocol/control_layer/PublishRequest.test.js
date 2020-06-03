import assert from 'assert'

import ValidationError from '../../../../src/errors/ValidationError'
import { ControlLayer, MessageLayer } from '../../../../src/index'

const { StreamMessage, MessageID } = MessageLayer
const { PublishRequest, ControlMessage } = ControlLayer

describe('PublishRequest', () => {
    const streamMessage = new StreamMessage({
        messageId: new MessageID('streamId', 0, 1529549961116, 0, 'publisherId', 'msgChainId'),
        content: {}
    })

    describe('constructor', () => {
        it('throws on null streamMessage', () => {
            assert.throws(() => new PublishRequest({
                requestId: 'requestId',
                sessionToken: 'sessionToken',
            }), ValidationError)
        })
        it('throws on invalid sessionToken', () => {
            assert.throws(() => new PublishRequest({
                requestId: 'requestId',
                streamMessage,
                sessionToken: 123,
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new PublishRequest({
                requestId: 'requestId',
                streamMessage,
                sessionToken: 'sessionToken',
            })
            assert(msg instanceof PublishRequest)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamMessage, streamMessage)
            assert.strictEqual(msg.sessionToken, 'sessionToken')
        })
    })
})
