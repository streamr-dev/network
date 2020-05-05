import assert from 'assert'

import ErrorPayload from '../../../../src/protocol/control_layer/error_response/ErrorPayload'
import ErrorResponseV0 from '../../../../src/protocol/control_layer/error_response/ErrorResponseV0'

describe('ErrorResponseV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = [null, {
                error: 'errorMessage',
            }]
            const payload = ErrorPayload.deserialize(arr[1])
            const result = new ErrorResponseV0(payload.error)

            assert(result instanceof ErrorResponseV0)
            assert.equal(result.subId, null)
            assert(result.payload instanceof ErrorPayload)
            assert.equal(result.payload.error, 'errorMessage')
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [0, 7, null, {
                error: 'errorMessage',
            }]
            const serialized = new ErrorResponseV0('errorMessage').serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
        it('correctly serializes messages to version 1', () => {
            const arr = [1, 7, 'errorMessage']
            const serialized = new ErrorResponseV0('errorMessage').serialize(1)
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
