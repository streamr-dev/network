import assert from 'assert'
import SubscribeRequest from '../../../src/protocol/SubscribeRequest'

describe('SubscribeRequest', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                type: 'subscribe',
                stream: 'streamId',
                partition: 0,
                authKey: 'authKey',
                sessionToken: 'sessionToken',
            }
            const result = SubscribeRequest.deserialize(JSON.stringify(msg))

            assert(result instanceof SubscribeRequest)
            assert.equal(result.streamId, msg.stream)
            assert.equal(result.streamPartition, msg.partition)
            assert.equal(result.apiKey, msg.authKey)
            assert.equal(result.sessionToken, msg.sessionToken)
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                type: 'subscribe',
                stream: 'streamId',
                partition: 0,
                authKey: 'authKey',
                sessionToken: 'sessionToken',
            }

            const serialized = new SubscribeRequest('streamId', 0, 'authKey', 'sessionToken').serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
