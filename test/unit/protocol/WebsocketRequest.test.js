import assert from 'assert'
import WebsocketRequest from '../../../src/protocol/WebsocketRequest'
import SubscribeRequest from '../../../src/protocol/SubscribeRequest'

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
        it('correctly parses any subclass instance', () => {
            const msg = new SubscribeRequest('streamId', 1, 'apiKey')
            const result = WebsocketRequest.deserialize(msg.serialize())
            assert.deepEqual(msg, result)
        })
    })
})
