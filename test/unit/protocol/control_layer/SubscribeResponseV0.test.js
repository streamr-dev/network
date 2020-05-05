import assert from 'assert'

import SubscribeResponseV0 from '../../../../src/protocol/control_layer/subscribe_response/SubscribeResponseV0'
import StreamAndPartition from '../../../../src/protocol/control_layer/StreamAndPartition'

describe('SubscribeResponseV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = [null, {
                stream: 'streamId',
                partition: 0,
            }]
            const payload = StreamAndPartition.deserialize(arr[1])
            const result = new SubscribeResponseV0(payload.streamId, payload.streamPartition)

            assert(result instanceof SubscribeResponseV0)
            assert.equal(result.subId, null)
            assert.equal(result.payload.streamId, 'streamId')
            assert.equal(result.payload.streamPartition, 0)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [0, 2, null, {
                stream: 'streamId',
                partition: 0,
            }]
            const serialized = new SubscribeResponseV0('streamId', 0).serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 1', () => {
            const arr = [1, 2, 'streamId', 0]
            const serialized = new SubscribeResponseV0('streamId', 0).serialize(1)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
