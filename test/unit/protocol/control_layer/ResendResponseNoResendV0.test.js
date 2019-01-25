import assert from 'assert'
import ResendResponseNoResendV0 from '../../../../src/protocol/control_layer/resend_response_no_resend/ResendResponseNoResendV0'

describe('ResendResponseNoResendV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = [null, {
                stream: 'streamId',
                partition: 0,
                sub: 'subId',
            }]
            const result = new ResendResponseNoResendV0(...ResendResponseNoResendV0.getConstructorArgs(arr))
            assert(result instanceof ResendResponseNoResendV0)
            assert.equal(result.subId, null)
            assert.equal(result.payload.streamId, 'streamId')
            assert.equal(result.payload.streamPartition, 0)
            assert.equal(result.payload.subId, 'subId')
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [0, 6, null, {
                stream: 'streamId',
                partition: 0,
                sub: 'subId',
            }]
            const serialized = new ResendResponseNoResendV0('streamId', 0, 'subId').serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 1', () => {
            const arr = [1, 6, 'streamId', 0, 'subId']
            const serialized = new ResendResponseNoResendV0('streamId', 0, 'subId').serialize(1)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
