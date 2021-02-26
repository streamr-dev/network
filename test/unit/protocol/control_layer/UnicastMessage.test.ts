import assert from 'assert'

import ValidationError from '../../../../src/errors/ValidationError'
import { StreamMessage, MessageID,  UnicastMessage, ControlMessage } from '../../../../src/index'

describe('UnicastMessage', () => {
    describe('constructor', () => {
        it('throws on null streamMessage', () => {
            assert.throws(() => new UnicastMessage({
                requestId: 'requestId',
                streamMessage: null as any,
            }), ValidationError)
        })
        it('throws on bogus streamMessage', () => {
            assert.throws(() => new UnicastMessage({
                requestId: 'requestId',
                streamMessage: {
                    fake: true,
                } as any,
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID('streamId', 0, 12345, 0, 'publisherId', 'msgChainId'),
                content: {},
            })

            const msg = new UnicastMessage({
                requestId: 'requestId',
                streamMessage,
            })
            assert(msg instanceof UnicastMessage)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert(msg.streamMessage instanceof StreamMessage)
            assert.strictEqual(msg.requestId, 'requestId')
        })
    })
})
