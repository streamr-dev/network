import assert from 'assert'
import ResendResponseMessage from '../../../src/protocol/ResendResponseMessage'

describe('ResendResponseMessage', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                stream: 'id',
                partition: 0,
                sub: '0',
            }
            const result = ResendResponseMessage.deserialize(JSON.stringify(msg))

            assert(result instanceof ResendResponseMessage)
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

            const serialized = new ResendResponseMessage('id', 0, 0).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
