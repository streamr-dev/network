import assert from 'assert'

import ResendResponseNoResend from '../../../../src/protocol/control_layer/resend_response/ResendResponseNoResend'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendResponseNoResend', () => {
    describe('constructor', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendResponseNoResend({
                streamId: 'streamId',
                streamPartition: 0,
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new ResendResponseNoResend({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
            })
            assert(msg instanceof ResendResponseNoResend)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.strictEqual(msg.requestId, 'requestId')
        })
    })
})
