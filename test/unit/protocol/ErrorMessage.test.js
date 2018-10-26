import assert from 'assert'
import ErrorResponse from '../../../src/protocol/ErrorResponse'

describe('ErrorResponse', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                error: 'foo',
            }
            const result = ErrorResponse.deserialize(JSON.stringify(msg))

            assert(result instanceof ErrorResponse)
            assert.equal(result.errorMessage, msg.error)
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                error: 'foo',
            }

            const serialized = new ErrorResponse(msg.error).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
