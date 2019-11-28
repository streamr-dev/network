import assert from 'assert'
import ResendResponseResending from '../../../../src/protocol/control_layer/resend_response_resending/ResendResponseResending'
import ResendResponseResendingV1 from '../../../../src/protocol/control_layer/resend_response_resending/ResendResponseResendingV1'

describe('ResendResponseResending', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendResponseResending.create('streamId', 0, 'requestId')
            assert(msg instanceof ResendResponseResendingV1)
            assert.equal(msg.streamId, 'streamId')
            assert.equal(msg.streamPartition, 0)
            assert.equal(msg.requestId, 'requestId')
        })
    })
})
