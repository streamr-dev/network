import assert from 'assert'
import ErrorMessage from '../../../src/protocol/ErrorMessage'

describe('ErrorMessage', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                error: 'foo',
            }
            const result = ErrorMessage.deserialize(JSON.stringify(msg))

            assert(result instanceof ErrorMessage)
            assert.equal(result.error, msg.error)
        })
    })

    describe('toObject()', () => {
        it('correctly serializes messages', () => {
            const msg = {
                error: 'foo',
            }

            const object = new ErrorMessage(msg.error).toObject()

            assert.deepEqual(msg, object)
        })
    })
})

