import assert from 'assert'

import ResendResponseNoResend from '../../../../src/protocol/control_layer/resend_response/ResendResponseNoResend'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendResponseNoResend', () => {
    describe('validation', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendResponseNoResend(ControlMessage.LATEST_VERSION, null, 'streamId', 0), ValidationError)
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendResponseNoResend.create('requestId', 'streamId', 0)
            assert(msg instanceof ResendResponseNoResend)
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.strictEqual(msg.requestId, 'requestId')
        })
    })
})
