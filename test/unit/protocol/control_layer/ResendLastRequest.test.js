import assert from 'assert'
import ResendLastRequestV1 from '../../../../src/protocol/control_layer/resend_request/ResendLastRequestV1'
import ResendLastRequest from '../../../../src/protocol/control_layer/resend_request/ResendLastRequest'

describe('ResendLastRequest', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const msg = ResendLastRequest.create('streamId', 0, 'requestId', 100, 'sessionToken')
            assert(msg instanceof ResendLastRequestV1)
            assert.equal(msg.streamId, 'streamId')
            assert.equal(msg.streamPartition, 0)
            assert.equal(msg.requestId, 'requestId')
            assert.equal(msg.numberLast, 100)
            assert.equal(msg.sessionToken, 'sessionToken')
        })
    })
})
