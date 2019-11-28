import assert from 'assert'
import ResendResponseResendingV0 from '../../../../src/protocol/control_layer/resend_response_resending/ResendResponseResendingV0'

describe('ResendResponseResendingV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const array = [null, {
                stream: 'streamId',
                partition: 0,
                sub: 'requestId',
            }]
            const result = new ResendResponseResendingV0(...ResendResponseResendingV0.getConstructorArgs(array))
            assert(result instanceof ResendResponseResendingV0)
            assert.equal(result.subId, null)
            assert.equal(result.payload.streamId, 'streamId')
            assert.equal(result.payload.streamPartition, 0)
            assert.equal(result.payload.requestId, 'requestId')
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [0, 4, null, {
                stream: 'streamId',
                partition: 0,
                sub: 'requestId',
            }]
            const serialized = new ResendResponseResendingV0('streamId', 0, 'requestId').serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 1', () => {
            const arr = [1, 4, 'streamId', 0, 'requestId']
            const serialized = new ResendResponseResendingV0('streamId', 0, 'requestId').serialize(1)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
