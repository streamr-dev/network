import assert from 'assert'
import ResendFromRequestV1 from '../../../../src/protocol/control_layer/resend_request/ResendFromRequestV1'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'

describe('ResendFromRequestV1', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = ['streamId', 0, 'subId', [132846894, 0], 'publisherId', 'msgChainId', 'sessionToken']
            const result = new ResendFromRequestV1(...arr)
            assert(result instanceof ResendFromRequestV1)
            assert.equal(result.streamId, 'streamId')
            assert.equal(result.streamPartition, 0)
            assert.equal(result.subId, 'subId')
            assert(result.fromMsgRef instanceof MessageRef)
            assert.equal(result.fromMsgRef.timestamp, 132846894)
            assert.equal(result.fromMsgRef.sequenceNumber, 0)
            assert.equal(result.publisherId, 'publisherId')
            assert.equal(result.msgChainId, 'msgChainId')
            assert.equal(result.sessionToken, 'sessionToken')
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [1, 12, 'streamId', 0, 'subId', [132846894, 0], 'publisherId', 'msgChainId', 'sessionToken']
            const serialized = new ResendFromRequestV1(
                'streamId', 0, 'subId', [132846894, 0], 'publisherId',
                'msgChainId', 'sessionToken',
            ).serialize()
            assert(typeof serialized === 'string')
            assert.deepEqual(arr, JSON.parse(serialized))
        })
    })
})
