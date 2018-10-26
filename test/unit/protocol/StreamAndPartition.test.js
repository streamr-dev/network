import assert from 'assert'
import StreamAndPartition from '../../../src/protocol/StreamAndPartition'

describe('StreamAndPartition', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                stream: 'id',
                partition: 0,
            }
            const result = StreamAndPartition.deserialize(JSON.stringify(msg))

            assert(result instanceof StreamAndPartition)
            assert.equal(result.streamId, msg.stream)
            assert.equal(result.streamPartition, msg.partition)
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                stream: 'id',
                partition: 0,
            }

            const serialized = new StreamAndPartition('id', 0).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
