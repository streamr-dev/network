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
            }
            const result = SubscribeRequest.deserialize(JSON.stringify(msg))

            assert(result instanceof SubscribeRequest)
            assert.equal(result.streamId, msg.stream)
            assert.equal(result.streamPartition, msg.partition)
            assert.equal(result.apiKey, msg.authKey)
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                type: 'subscribe',
                stream: 'streamId',
                partition: 0,
                authKey: 'authKey',
            }

            const serialized = new SubscribeRequest('streamId', 0, 'authKey').serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
