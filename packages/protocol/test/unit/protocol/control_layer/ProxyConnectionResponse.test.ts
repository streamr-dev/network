import assert from 'assert'

import ValidationError from '../../../../src/errors/ValidationError'
import { ProxyConnectionResponse, ControlMessage, toStreamID } from '../../../../src/index'
import { ProxyDirection } from '../../../../src/utils/types'

describe('ProxyPublishStreamConnectionResponse', () => {
    const streamId = toStreamID('stream')
    const streamPartition = 0
    const senderId = 'node'
    const accepted = true
    const direction = ProxyDirection.PUBLISH

    it('should create the latest version', () => {
        const msg = new ProxyConnectionResponse({
            requestId: 'requestId',
            streamId,
            streamPartition,
            senderId,
            direction,
            accepted,
        })
        assert(msg instanceof ProxyConnectionResponse)
        assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
        assert.strictEqual(msg.requestId, 'requestId')
        assert.strictEqual(msg.streamId, streamId)
        assert.strictEqual(msg.streamPartition, streamPartition)
        assert.strictEqual(msg.senderId, senderId)
        assert.strictEqual(msg.accepted, accepted)
        assert.strictEqual(msg.direction, direction)

    })

    it('throws on null streamId', () => {
        assert.throws(() => new ProxyConnectionResponse({
            requestId: 'requestId',
            streamId: null as any,
            streamPartition,
            senderId,
            direction,
            accepted
        }), ValidationError)
    })

    it('throws on null streamPartition', () => {
        assert.throws(() => new ProxyConnectionResponse({
            requestId: 'requestId',
            streamId,
            streamPartition: null as any,
            senderId,
            direction,
            accepted,
        }), ValidationError)
    })

    it('throws on null senderId', () => {
        assert.throws(() => new ProxyConnectionResponse({
            requestId: 'requestId',
            streamId,
            streamPartition,
            senderId: null as any,
            direction,
            accepted,
        }), ValidationError)
    })

    it('throws on null accepted', () => {
        assert.throws(() => new ProxyConnectionResponse({
            requestId: 'requestId',
            streamId,
            streamPartition,
            senderId,
            direction,
            accepted: null as any
        }), ValidationError)
    })
})
