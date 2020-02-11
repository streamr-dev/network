import assert from 'assert'
import UnsubscribeRequest from '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequest'
import UnsubscribeRequestV1 from '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequestV1'

describe('UnsubscribeRequestV1', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = ['streamId', 0]
            const result = new UnsubscribeRequestV1(...arr)
            assert.equal(result.streamId, 'streamId')
            assert.equal(result.streamPartition, 0)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [1, UnsubscribeRequest.TYPE, 'streamId', 0]

            const serialized = new UnsubscribeRequestV1('streamId', 0).serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 0', () => {
            const msg = {
                type: 'unsubscribe',
                stream: 'streamId',
                partition: 0,
            }
            const serialized = new UnsubscribeRequestV1('streamId', 0).serialize(0)
            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
