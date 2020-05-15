import assert from 'assert'

import ResendLastRequest from '../../../../src/protocol/control_layer/resend_request/ResendLastRequest'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendLastRequest', () => {
    describe('validation', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendLastRequest(ControlMessage.LATEST_VERSION, null, 'streamId', 0, 100, 'sessionToken'), ValidationError)
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendLastRequest.create('requestId', 'streamId', 0, 100, 'sessionToken')
            assert(msg instanceof ResendLastRequest)
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.numberLast, 100)
            assert.strictEqual(msg.sessionToken, 'sessionToken')
        })
    })
})
