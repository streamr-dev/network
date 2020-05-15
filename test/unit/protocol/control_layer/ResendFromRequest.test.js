import assert from 'assert'

import ResendFromRequest from '../../../../src/protocol/control_layer/resend_request/ResendFromRequest'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendFromRequest', () => {
    describe('validation', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendFromRequest(ControlMessage.LATEST_VERSION, null, 'streamId', 0, new MessageRef(132846894, 0), 'publisherId', 'sessionToken'), ValidationError)
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendFromRequest.create('requestId', 'streamId', 0, new MessageRef(132846894, 0), 'publisherId', 'sessionToken')
            assert(msg instanceof ResendFromRequest)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert(msg.fromMsgRef instanceof MessageRef)
            assert.strictEqual(msg.publisherId, 'publisherId')
            assert.strictEqual(msg.sessionToken, 'sessionToken')
        })
    })
})
