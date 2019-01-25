import assert from 'assert'
import ErrorResponse from '../../../../src/protocol/control_layer/error_response/ErrorResponse'
import ErrorResponseV1 from '../../../../src/protocol/control_layer/error_response/ErrorResponseV1'

describe('ErrorResponse', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ErrorResponse.create('error message')
            assert(msg instanceof ErrorResponseV1)
            assert.strictEqual(msg.errorMessage, 'error message')
        })
    })
})
