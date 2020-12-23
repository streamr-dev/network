import assert from 'assert'

import ValidationError from '../../../../src/errors/ValidationError'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'
import ErrorMessage from '../../../../src/protocol/tracker_layer/error_message/ErrorMessage'

describe('ErrorMessage', () => {
    describe('constructor', () => {
        it('throws on null targetNode', () => {
            assert.throws(() => new ErrorMessage({
                requestId: 'requestId',
                errorCode: ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
                targetNode: null as any
            }), ValidationError)
        })
        it('throws on null errorCode', () => {
            assert.throws(() => new ErrorMessage({
                requestId: 'requestId',
                errorCode: null as any,
                targetNode: 'targetNode'
            }), ValidationError)
        })
        it('throws on invalid errorCode', () => {
            assert.throws(() => new ErrorMessage({
                requestId: 'requestId',
                errorCode: 'INVALID-CODE' as any,
                targetNode: 'targetNode'
            }), ValidationError)
        })
        it('throws on null requestId', () => {
            assert.throws(() => new ErrorMessage({
                requestId: null as any,
                errorCode: ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
                targetNode: 'targetNode'
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new ErrorMessage({
                requestId: 'requestId',
                errorCode: ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
                targetNode: 'targetNode'
            })
            assert(msg instanceof ErrorMessage)
            assert.strictEqual(msg.version, TrackerMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.errorCode, ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER)
            assert.strictEqual(msg.targetNode, 'targetNode')
        })
    })
})
