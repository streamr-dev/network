import assert from 'assert'
import ResendResponseResendingV1 from '../../../../src/protocol/control_layer/resend_response_resending/ResendResponseResendingV1'

describe('ResendResponseResendingV1', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = ['streamId', 0, 'requestId']
            const result = new ResendResponseResendingV1(...arr)
            assert(result instanceof ResendResponseResendingV1)
            assert.equal(result.streamId, 'streamId')
            assert.equal(result.streamPartition, 0)
            assert.equal(result.requestId, 'requestId')
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [1, 4, 'streamId', 0, 'requestId']
            const serialized = new ResendResponseResendingV1('streamId', 0, 'requestId').serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 0', () => {
            const arr = [0, 4, null, {
                stream: 'streamId',
                partition: 0,
                sub: 'requestId',
            }]
            const serialized = new ResendResponseResendingV1('streamId', 0, 'requestId').serialize(0)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
