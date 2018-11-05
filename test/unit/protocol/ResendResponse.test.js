import assert from 'assert'
import ResendResponsePayload from '../../../src/protocol/ResendResponsePayload'

describe('ResendResponsePayload', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                stream: 'id',
                partition: 0,
                sub: '0',
            }
            const result = ResendResponsePayload.deserialize(JSON.stringify(msg))

            assert(result instanceof ResendResponsePayload)
            assert.equal(result.streamId, msg.stream)
            assert.equal(result.streamPartition, msg.partition)
            assert.equal(result.subId, msg.sub)
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                stream: 'id',
                partition: 0,
                sub: '0',
            }

            const serialized = new ResendResponsePayload('id', 0, 0).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
