import assert from 'assert'
import PublishRequest from '../../../src/protocol/PublishRequest'

describe('PublishRequest', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                type: 'publish',
                stream: 'streamId',
                authKey: 'authKey',
                msg: JSON.stringify({
                    foo: 'bar',
                }),
                ts: 1533924184016,
                pkey: 'deviceId',
            }
            const result = PublishRequest.deserialize(JSON.stringify(msg))

            assert(result instanceof PublishRequest)
            assert.equal(result.streamId, msg.stream)
            assert.equal(result.apiKey, msg.authKey)
            assert.equal(result.content, msg.msg)
            assert.equal(result.timestamp, msg.ts)
            assert.equal(result.partitionKey, msg.pkey)
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                type: 'publish',
                stream: 'streamId',
                authKey: 'authKey',
                msg: '{}',
                ts: 1533924184016,
                pkey: 'deviceId',
            }

            const serialized = new PublishRequest('streamId', 'authKey', {}, 1533924184016, 'deviceId').serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
