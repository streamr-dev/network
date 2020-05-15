import assert from 'assert'

import ErrorResponse from '../../../../src/protocol/control_layer/error_response/ErrorResponse'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ErrorResponse', () => {
    describe('validation', () => {
        it('throws on null error message', () => {
            assert.throws(() => new ErrorResponse(ControlMessage.LATEST_VERSION, 'requestId', null), ValidationError)
        })
        it('throws on null error code (since V2)', () => {
            assert.throws(() => new ErrorResponse(ControlMessage.LATEST_VERSION, 'requestId', 'error message', null), ValidationError)
        })
        it('accepts null error code (before V2)', () => {
            assert.doesNotThrow(() => new ErrorResponse(1, 'requestId', 'error message', null))
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ErrorResponse.create('requestId', 'error message', 'ERROR_CODE')
            assert(msg instanceof ErrorResponse)
            assert.strictEqual(msg.errorMessage, 'error message')
            assert.strictEqual(msg.errorCode, 'ERROR_CODE')
        })
    })
})
