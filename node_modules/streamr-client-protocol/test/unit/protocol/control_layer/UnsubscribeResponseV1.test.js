import assert from 'assert'
import UnsubscribeResponseV1 from '../../../../src/protocol/control_layer/unsubscribe_response/UnsubscribeResponseV1'

describe('UnsubscribeResponseV1', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = ['streamId', 0]
            const result = new UnsubscribeResponseV1(...arr)
            assert(result instanceof UnsubscribeResponseV1)
            assert.equal(result.streamId, 'streamId')
            assert.equal(result.streamPartition, 0)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [1, 3, 'streamId', 0]
            const serialized = new UnsubscribeResponseV1('streamId', 0).serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 0', () => {
            const arr = [0, 3, null, {
                stream: 'streamId',
                partition: 0,
            }]
            const serialized = new UnsubscribeResponseV1('streamId', 0).serialize(0)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
