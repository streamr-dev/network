import assert from 'assert'
import WebsocketRequest from '../../../src/protocol/WebsocketRequest'

describe('WebsocketRequest', () => {
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                type: 'unsubscribe',
                stream: 'id',
                authKey: 'authKey',
                sessionToken: 'sessionToken',
            }

            const serialized = new WebsocketRequest(msg.type, msg.stream, msg.authKey, msg.sessionToken).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })

    describe('deserialize', () => {
        it('returns objects as they are', () => {
            const msg = {
                foo: 'bar',
            }
            const result = WebsocketRequest.deserialize(msg)
            assert.deepEqual(msg, result)
        })
        it('parses strings', () => {
            const msg = {
                foo: 'bar',
            }
            const result = WebsocketRequest.deserialize(JSON.stringify(msg))
            assert.deepEqual(msg, result)
        })
    })
})
