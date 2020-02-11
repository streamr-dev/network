import assert from 'assert'
import ResendResponseResent from '../../../../src/protocol/control_layer/resend_response_resent/ResendResponseResent'
import ResendResponseResentV1 from '../../../../src/protocol/control_layer/resend_response_resent/ResendResponseResentV1'

describe('ResendResponseResent', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendResponseResent.create('streamId', 0, 'requestId')
            assert(msg instanceof ResendResponseResentV1)
            assert.equal(msg.streamId, 'streamId')
            assert.equal(msg.streamPartition, 0)
            assert.equal(msg.requestId, 'requestId')
        })
    })
})
