import assert from 'assert'

import ValidationError from '../../../../src/errors/ValidationError'
import { SubscribeStreamConnectionRequest, ControlMessage, toStreamID } from '../../../../src/index'

describe('SubscribeStreamConnectionRequest', () => {
    const streamId = toStreamID('stream')
    const streamPartition = 0
    const senderId = 'node'

    it('should create the latest version', () => {
        const msg = new SubscribeStreamConnectionRequest({
            requestId: 'requestId',
            streamId,
            streamPartition,
            senderId
        })
        assert(msg instanceof SubscribeStreamConnectionRequest)
        assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
        assert.strictEqual(msg.requestId, 'requestId')
        assert.strictEqual(msg.streamId, streamId)
        assert.strictEqual(msg.streamPartition, streamPartition)
        assert.strictEqual(msg.senderId, senderId)
    })

    it('throws on null streamId', () => {
        assert.throws(() => new SubscribeStreamConnectionRequest({
            requestId: 'requestId',
            streamId: null as any,
            streamPartition,
            senderId
        }), ValidationError)
    })

    it('throws on null streamPartition', () => {
        assert.throws(() => new SubscribeStreamConnectionRequest({
            requestId: 'requestId',
            streamId,
            streamPartition: null as any,
            senderId
        }), ValidationError)
    })

    it('throws on null senderId', () => {
        assert.throws(() => new SubscribeStreamConnectionRequest({
            requestId: 'requestId',
            streamId,
            streamPartition,
            senderId: null as any
        }), ValidationError)
    })
})
