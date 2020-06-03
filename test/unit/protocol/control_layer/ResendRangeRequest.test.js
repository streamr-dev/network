import assert from 'assert'

import ResendRangeRequest from '../../../../src/protocol/control_layer/resend_request/ResendRangeRequest'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendRangeRequest', () => {
    describe('constructor', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendRangeRequest({
                streamId: 'streamId',
                streamPartition: 0,
                fromMsgRef: new MessageRef(132846894, 0),
                toMsgRef: new MessageRef(132847000, 0),
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                sessionToken: 'sessionToken',
            }), ValidationError)
        })
        it('throws if from > to', () => {
            assert.throws(() => new ResendRangeRequest({
                streamId: 'streamId',
                streamPartition: 0,
                fromMsgRef: new MessageRef(132847000, 0),
                toMsgRef: new MessageRef(132846894, 0),
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                sessionToken: 'sessionToken',
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new ResendRangeRequest({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
                fromMsgRef: new MessageRef(132846894, 0),
                toMsgRef: new MessageRef(132847000, 0),
                publisherId: 'publisherId',
                msgChainId: 'msgChainId',
                sessionToken: 'sessionToken',
            })
            assert(msg instanceof ResendRangeRequest)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.strictEqual(msg.requestId, 'requestId')
            assert(msg.fromMsgRef instanceof MessageRef)
            assert(msg.toMsgRef instanceof MessageRef)
            assert.strictEqual(msg.publisherId, 'publisherId')
            assert.strictEqual(msg.msgChainId, 'msgChainId')
            assert.strictEqual(msg.sessionToken, 'sessionToken')
        })
    })
})
