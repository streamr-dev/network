import assert from 'assert'

import ResendRangeRequest from '../../../../src/protocol/control_layer/resend_request/ResendRangeRequest'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('ResendRangeRequest', () => {
    describe('validation', () => {
        it('throws on null requestId', () => {
            assert.throws(() => new ResendRangeRequest(ControlMessage.LATEST_VERSION,
                null, 'streamId', 0, new MessageRef(132846894, 0),
                new MessageRef(132847000, 0), 'publisherId',
                'msgChainId', 'sessionToken'), ValidationError)
        })
        it('throws if from > to', () => {
            assert.throws(() => new ResendRangeRequest(ControlMessage.LATEST_VERSION,
                'requestId', 'streamId', 0,
                new MessageRef(132847000, 0),
                new MessageRef(132846894, 0), 'publisherId',
                'msgChainId', 'sessionToken'), ValidationError)
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendRangeRequest.create(
                'requestId', 'streamId', 0,
                new MessageRef(132846894, 0), new MessageRef(132847000, 0),
                'publisherId', 'msgChainId', 'sessionToken',
            )
            assert(msg instanceof ResendRangeRequest)
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
