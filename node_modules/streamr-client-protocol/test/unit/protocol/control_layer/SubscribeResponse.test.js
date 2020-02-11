import assert from 'assert'
import SubscribeResponse from '../../../../src/protocol/control_layer/subscribe_response/SubscribeResponse'
import SubscribeResponseV1 from '../../../../src/protocol/control_layer/subscribe_response/SubscribeResponseV1'

describe('SubscribeResponse', () => {
    describe('create', () => {
        it('should create the latest version', () => {
            const msg = SubscribeResponse.create('streamId', 0)
            assert(msg instanceof SubscribeResponseV1)
            assert.equal(msg.streamId, 'streamId')
            assert.equal(msg.streamPartition, 0)
        })
    })
})
