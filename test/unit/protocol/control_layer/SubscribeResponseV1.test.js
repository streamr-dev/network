import assert from 'assert'

import SubscribeResponseV1 from '../../../../src/protocol/control_layer/subscribe_response/SubscribeResponseV1'

describe('SubscribeResponseV1', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = ['streamId', 0]
            const result = new SubscribeResponseV1(...arr)
            assert(result instanceof SubscribeResponseV1)
            assert.equal(result.streamId, 'streamId')
            assert.equal(result.streamPartition, 0)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [1, 2, 'streamId', 0]
            const serialized = new SubscribeResponseV1('streamId', 0).serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 0', () => {
            const arr = [0, 2, null, {
                stream: 'streamId',
                partition: 0,
            }]
            const serialized = new SubscribeResponseV1('streamId', 0).serialize(0)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
