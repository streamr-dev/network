import assert from 'assert'
import ResendResponse from '../../../src/protocol/ResendResponse'

describe('ResendResponse', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                stream: 'id',
                partition: 0,
                sub: '0',
            }
            const result = ResendResponse.deserialize(JSON.stringify(msg))

            assert(result instanceof ResendResponse)
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

            const serialized = new ResendResponse('id', 0, 0).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
