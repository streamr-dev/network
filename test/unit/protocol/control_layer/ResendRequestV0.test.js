import assert from 'assert'
import ResendRequestV0 from '../../../../src/protocol/control_layer/resend_request/ResendRequestV0'

describe('ResendRequestV0', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const msg = {
                type: 'resend',
                stream: 'id',
                partition: 0,
                sub: 'subId',
                resend_all: true,
            }
            const result = new ResendRequestV0(...ResendRequestV0.getConstructorArgs(msg))
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

            const serialized = new ResendRequestV0('id', 0, 'subId', {
                resend_all: true,
            }).serialize()

            assert(typeof serialized === 'string')
            assert.deepEqual(msg, JSON.parse(serialized))
        })
    })
})
