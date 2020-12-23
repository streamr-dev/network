import assert from 'assert'

import ErrorResponse, { ErrorCode } from '../../../../src/protocol/control_layer/error_response/ErrorResponse'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ErrorResponse', () => {
    describe('constructor', () => {
        it('throws on null error message', () => {
            assert.throws(() => new ErrorResponse({
                requestId: 'requestId',
                errorMessage: undefined,
            } as any), ValidationError)
        })
        it('throws on null error code (since V2)', () => {
            assert.throws(() => new ErrorResponse({
                requestId: 'requestId',
                errorMessage: 'error message',
                errorCode: null as any,
            }), ValidationError)
        })
        it('accepts null error code (before V2)', () => {
            assert.doesNotThrow(() => new ErrorResponse({
                version: 1,
                requestId: 'requestId',
                errorMessage: 'error message',
                errorCode: null as any,
            }))
        })
        it('should create the latest version', () => {
            const msg = new ErrorResponse({
                requestId: 'requestId',
                errorMessage: 'error message',
                errorCode: ErrorCode.NOT_FOUND,
            })
            assert(msg instanceof ErrorResponse)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.errorMessage, 'error message')
            assert.strictEqual(msg.errorCode, ErrorCode.NOT_FOUND)
        })
    })
})
