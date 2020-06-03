import assert from 'assert'

import SubscribeRequest from '../../../../src/protocol/control_layer/subscribe_request/SubscribeRequest'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('SubscribeRequest', () => {
    describe('constructor', () => {
        it('throws on null streamId', () => {
            assert.throws(() => new SubscribeRequest({
                requestId: 'requestId',
                streamId: null,
                streamPartition: 0,
                sessionToken: 'sessionToken',
            }), ValidationError)
        })
        it('throws on null streamPartition', () => {
            assert.throws(() => new SubscribeRequest({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: null,
                sessionToken: 'sessionToken',
            }), ValidationError)
        })
        it('throws on null requestId (since V2)', () => {
            assert.throws(() => new SubscribeRequest({
                requestId: null,
                streamId: 'streamId',
                streamPartition: 0,
                sessionToken: 'sessionToken',
            }), ValidationError)
        })
        it('does not throw on null requestId (before V2)', () => {
            assert.doesNotThrow(() => new SubscribeRequest({
                version: 1,
                requestId: null,
                streamId: 'streamId',
                streamPartition: 0,
                sessionToken: 'sessionToken',
            }))
        })
        it('should create the latest version', () => {
            const msg = new SubscribeRequest({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
                sessionToken: 'sessionToken',
            })
            assert(msg instanceof SubscribeRequest)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.strictEqual(msg.sessionToken, 'sessionToken')
        })
    })
})
