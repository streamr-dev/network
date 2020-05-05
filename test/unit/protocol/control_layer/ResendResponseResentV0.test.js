import assert from 'assert'

import ResendResponseResentV0 from '../../../../src/protocol/control_layer/resend_response_resent/ResendResponseResentV0'
import ResendResponsePayload from '../../../../src/protocol/control_layer/ResendResponsePayload'

describe('ResendResponseResentV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = [null, {
                stream: 'streamId',
                partition: 0,
                sub: 'requestId',
            }]
            const payload = ResendResponsePayload.deserialize(arr[1])
            const result = new ResendResponseResentV0(...ResendResponseResentV0.getConstructorArguments(payload))
            assert(result instanceof ResendResponseResentV0)
            assert.equal(result.requestId, null)
            assert.equal(result.payload.streamId, 'streamId')
            assert.equal(result.payload.streamPartition, 0)
            assert.equal(result.payload.requestId, 'requestId')
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [0, 5, null, {
                stream: 'streamId',
                partition: 0,
                sub: 'requestId',
            }]
            const serialized = new ResendResponseResentV0('streamId', 0, 'requestId').serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 1', () => {
            const arr = [1, 5, 'streamId', 0, 'requestId']
            const serialized = new ResendResponseResentV0('streamId', 0, 'requestId').serialize(1)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
