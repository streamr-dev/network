import assert from 'assert'
import UnsubscribeRequest from '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequest'
import UnsubscribeRequestV1 from '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequestV1'

describe('UnsubscribeRequest', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const msg = UnsubscribeRequest.create('streamId', 0)
            assert(msg instanceof UnsubscribeRequestV1)
            assert.equal(msg.streamId, 'streamId')
            assert.equal(msg.streamPartition, 0)
        })
    })
})
