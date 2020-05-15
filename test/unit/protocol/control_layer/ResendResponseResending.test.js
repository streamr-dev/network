import assert from 'assert'

import ResendResponseResending from '../../../../src/protocol/control_layer/resend_response/ResendResponseResending'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendResponseResending', () => {
    describe('validation', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendResponseResending(ControlMessage.LATEST_VERSION, null, 'streamId', 0), ValidationError)
        })
    })
    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendResponseResending.create('requestId', 'streamId', 0)
            assert(msg instanceof ResendResponseResending)
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.strictEqual(msg.requestId, 'requestId')
        })
    })
})
