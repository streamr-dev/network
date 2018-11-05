import assert from 'assert'
import ErrorPayload from '../../../src/protocol/ErrorPayload'

describe('ErrorPayload', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                error: 'foo',
            }
            const result = ErrorPayload.deserialize(JSON.stringify(msg))

            assert(result instanceof ErrorPayload)
            assert.equal(result.error, msg.error)
        })
    })

    describe('toObject()', () => {
        it('correctly serializes messages', () => {
            const msg = {
                error: 'foo',
            }

            const object = new ErrorPayload(msg.error).toObject()

            assert.deepEqual(msg, object)
        })
    })
})

