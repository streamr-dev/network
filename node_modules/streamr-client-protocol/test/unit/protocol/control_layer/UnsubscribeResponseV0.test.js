import assert from 'assert'
import UnsubscribeResponseV0 from '../../../../src/protocol/control_layer/unsubscribe_response/UnsubscribeResponseV0'
import StreamAndPartition from '../../../../src/protocol/control_layer/StreamAndPartition'

describe('UnsubscribeResponseV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = [null, {
                stream: 'streamId',
                partition: 0,
            }]
            const payload = StreamAndPartition.deserialize(arr[1])
            const result = new UnsubscribeResponseV0(payload.streamId, payload.streamPartition)

            assert(result instanceof UnsubscribeResponseV0)
            assert.equal(result.subId, null)
            assert.equal(result.payload.streamId, 'streamId')
            assert.equal(result.payload.streamPartition, 0)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [0, 3, null, {
                stream: 'streamId',
                partition: 0,
            }]
            const serialized = new UnsubscribeResponseV0('streamId', 0).serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 1', () => {
            const arr = [1, 3, 'streamId', 0]
            const serialized = new UnsubscribeResponseV0('streamId', 0).serialize(1)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
