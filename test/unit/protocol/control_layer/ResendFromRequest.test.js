import assert from 'assert'

import ResendFromRequestV1 from '../../../../src/protocol/control_layer/resend_request/ResendFromRequestV1'
import ResendFromRequest from '../../../../src/protocol/control_layer/resend_request/ResendFromRequest'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'

describe('ResendFromRequest', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendFromRequest.create('streamId', 0, 'requestId', [132846894, 0], 'publisherId', 'msgChainId', 'sessionToken')
            assert(msg instanceof ResendFromRequestV1)
            assert.equal(msg.streamId, 'streamId')
            assert.equal(msg.streamPartition, 0)
            assert.equal(msg.requestId, 'requestId')
            assert(msg.fromMsgRef instanceof MessageRef)
            assert.equal(msg.publisherId, 'publisherId')
            assert.equal(msg.msgChainId, 'msgChainId')
            assert.equal(msg.sessionToken, 'sessionToken')
        })
    })
})
