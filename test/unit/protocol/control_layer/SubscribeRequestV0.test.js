import assert from 'assert'

import SubscribeRequestV0 from '../../../../src/protocol/control_layer/subscribe_request/SubscribeRequestV0'
import SubscribeRequest from '../../../../src/protocol/control_layer/subscribe_request/SubscribeRequest'

describe('SubscribeRequestV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                type: 'subscribe',
                stream: 'streamId',
                partition: 0,
                authKey: 'authKey',
                sessionToken: 'sessionToken',
            }
            const result = new SubscribeRequestV0(...SubscribeRequestV0.getConstructorArgs(msg))

            assert(result instanceof SubscribeRequestV0)
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

            const serialized = new SubscribeRequestV0('streamId', 0, 'authKey', 'sessionToken').serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 1', () => {
            const arr = [1, SubscribeRequest.TYPE, 'streamId', 0, 'sessionToken']
            const serialized = new SubscribeRequestV0('streamId', 0, 'apiKey', 'sessionToken').serialize(1)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
