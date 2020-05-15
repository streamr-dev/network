import assert from 'assert'

import ResendResponseResent from '../../../../src/protocol/control_layer/resend_response/ResendResponseResent'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendResponseResent', () => {
    describe('validation', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendResponseResent(ControlMessage.LATEST_VERSION, null, 'streamId', 0), ValidationError)
        })
    })
    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendResponseResent.create('requestId', 'streamId', 0)
            assert(msg instanceof ResendResponseResent)
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.strictEqual(msg.requestId, 'requestId')
        })
    })
})
