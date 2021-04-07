import assert from 'assert'

import ResendResponseResending from '../../../../src/protocol/control_layer/resend_response/ResendResponseResending'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendResponseResending', () => {
    describe('constructor', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendResponseResending({
                streamId: 'streamId',
                streamPartition: 0,
            } as any), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new ResendResponseResending({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
            })
            assert(msg instanceof ResendResponseResending)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.strictEqual(msg.requestId, 'requestId')
        })
    })
})
