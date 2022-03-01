import assert from 'assert'

import ValidationError from '../../../../src/errors/ValidationError'
import { SubscribeStreamConnectionResponse, ControlMessage, toStreamID } from '../../../../src/index'

describe('SubscribeStreamConnectionResponse', () => {
    const streamId = toStreamID('stream')
    const streamPartition = 0
    const senderId = 'node'
    const accepted = true

    it('should create the latest version', () => {
        const msg = new SubscribeStreamConnectionResponse({
            requestId: 'requestId',
            streamId,
            streamPartition,
            senderId,
            accepted
        })
        assert(msg instanceof SubscribeStreamConnectionResponse)
        assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
        assert.strictEqual(msg.requestId, 'requestId')
        assert.strictEqual(msg.streamId, streamId)
        assert.strictEqual(msg.streamPartition, streamPartition)
        assert.strictEqual(msg.senderId, senderId)
        assert.strictEqual(msg.accepted, accepted)

    })

    it('throws on null streamId', () => {
        assert.throws(() => new SubscribeStreamConnectionResponse({
            requestId: 'requestId',
            streamId: null as any,
            streamPartition,
            senderId,
            accepted
        }), ValidationError)
    })

    it('throws on null streamPartition', () => {
        assert.throws(() => new SubscribeStreamConnectionResponse({
            requestId: 'requestId',
            streamId,
            streamPartition: null as any,
            senderId,
            accepted
        }), ValidationError)
    })

    it('throws on null senderId', () => {
        assert.throws(() => new SubscribeStreamConnectionResponse({
            requestId: 'requestId',
            streamId,
            streamPartition,
            senderId: null as any,
            accepted
        }), ValidationError)
    })

    it('throws on null accepted', () => {
        assert.throws(() => new SubscribeStreamConnectionResponse({
            requestId: 'requestId',
            streamId,
            streamPartition,
            senderId,
            accepted: null as any
        }), ValidationError)
    })
})
