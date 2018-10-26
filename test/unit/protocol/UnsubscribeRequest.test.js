import assert from 'assert'
import UnsubscribeRequest from '../../../src/protocol/UnsubscribeRequest'

describe('UnsubscribeRequest', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                type: 'unsubscribe',
                stream: 'id',
                partition: 0,
            }
            const result = UnsubscribeRequest.deserialize(JSON.stringify(msg))

            assert(result instanceof UnsubscribeRequest)
            assert.equal(result.streamId, msg.stream)
            assert.equal(result.streamPartition, msg.partition)
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                type: 'unsubscribe',
                stream: 'id',
                partition: 0,
            }

            const serialized = new UnsubscribeRequest('id', 0).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
