import assert from 'assert'
import ResendRequest from '../../../src/protocol/ResendRequest'

describe('ResendRequest', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                type: 'resend',
                stream: 'id',
                partition: 0,
                sub: 'subId',
                resend_all: true,
            }
            const result = ResendRequest.deserialize(JSON.stringify(msg))

            assert(result instanceof ResendRequest)
            assert.equal(result.streamId, msg.stream)
            assert.equal(result.streamPartition, msg.partition)
            assert.equal(result.subId, msg.sub)
            assert.deepEqual(result.resendOptions, {
                resend_all: true,
            })
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const msg = {
                type: 'resend',
                stream: 'id',
                partition: 0,
                sub: 'subId',
                resend_all: true,
            }

            const serialized = new ResendRequest('id', 0, 'subId', {
                resend_all: true,
            }).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
