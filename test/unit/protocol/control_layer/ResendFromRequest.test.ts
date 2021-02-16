import assert from 'assert'

import ResendFromRequest from '../../../../src/protocol/control_layer/resend_request/ResendFromRequest'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendFromRequest', () => {
    describe('constructor', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendFromRequest({
                requestId: null as any,
                streamId: 'streamId',
                streamPartition: 0,
                fromMsgRef: new MessageRef(132846894, 0),
                publisherId: 'publisherId',
                sessionToken: 'sessionToken',
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new ResendFromRequest({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
                fromMsgRef: new MessageRef(132846894, 0),
                publisherId: 'publisherId',
                sessionToken: 'sessionToken',
            })
            assert(msg instanceof ResendFromRequest)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert(msg.fromMsgRef instanceof MessageRef)
            assert.strictEqual(msg.publisherId, 'publisherId')
            assert.strictEqual(msg.sessionToken, 'sessionToken')
        })

        it('publisherId and sessionToken can be null', () => {
            const msg = new ResendFromRequest({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
                fromMsgRef: new MessageRef(132846894, 0),
                publisherId: null,
                sessionToken: null
            })
            assert(msg instanceof ResendFromRequest)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert(msg.fromMsgRef instanceof MessageRef)
            assert.strictEqual(msg.publisherId, null)
            assert.strictEqual(msg.sessionToken, null)
        })
    })
})
