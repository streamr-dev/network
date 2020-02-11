import assert from 'assert'
import ResendLastRequestV1 from '../../../../src/protocol/control_layer/resend_request/ResendLastRequestV1'

describe('ResendLastRequestV1', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = ['streamId', 0, 'requestId', 100, 'sessionToken']
            const result = new ResendLastRequestV1(...arr)
            assert(result instanceof ResendLastRequestV1)
            assert.equal(result.streamId, 'streamId')
            assert.equal(result.streamPartition, 0)
            assert.equal(result.requestId, 'requestId')
            assert.equal(result.numberLast, 100)
            assert.equal(result.sessionToken, 'sessionToken')
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [1, 11, 'streamId', 0, 'requestId', 100, 'sessionToken']
            const serialized = new ResendLastRequestV1('streamId', 0, 'requestId', 100, 'sessionToken').serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
