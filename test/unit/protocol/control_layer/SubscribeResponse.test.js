import assert from 'assert'

import SubscribeResponse from '../../../../src/protocol/control_layer/subscribe_response/SubscribeResponse'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('SubscribeResponse', () => {
    describe('constructor', () => {
        it('throws on null streamId', () => {
            assert.throws(() => new SubscribeResponse({
                requestId: 'requestId',
                streamId: null,
                streamPartition: 0,
            }), ValidationError)
        })
        it('throws on null streamPartition', () => {
            assert.throws(() => new SubscribeResponse({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: null,
            }), ValidationError)
        })
        it('throws on null requestId (since V2)', () => {
            assert.throws(() => new SubscribeResponse({
                requestId: null,
                streamId: 'streamId',
                streamPartition: 0,
            }), ValidationError)
        })
        it('does not throw on null requestId (before V2)', () => {
            assert.doesNotThrow(() => new SubscribeResponse({
                version: 1,
                requestId: null,
                streamId: 'streamId',
                streamPartition: 0,
            }))
        })
        it('should create the latest version', () => {
            const msg = new SubscribeResponse({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
            })
            assert(msg instanceof SubscribeResponse)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
        })
    })
})
