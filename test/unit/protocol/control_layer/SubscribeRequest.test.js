import assert from 'assert'

import SubscribeRequest from '../../../../src/protocol/control_layer/subscribe_request/SubscribeRequest'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('SubscribeRequest', () => {
    describe('validation', () => {
        it('throws on null streamId', () => {
            assert.throws(() => new SubscribeRequest(ControlMessage.LATEST_VERSION, 'requestId', null, 0, 'sessionToken'), ValidationError)
        })
        it('throws on null streamPartition', () => {
            assert.throws(() => new SubscribeRequest(ControlMessage.LATEST_VERSION, 'requestId', 'streamId', null, 'sessionToken'), ValidationError)
        })
        it('throws on null requestId (since V2)', () => {
            assert.throws(() => new SubscribeRequest(ControlMessage.LATEST_VERSION, null, 'streamId', 0, 'sessionToken'), ValidationError)
        })
        it('does not throw on null requestId (before V2)', () => {
            assert.doesNotThrow(() => new SubscribeRequest(1, null, 'streamId', 0, 'sessionToken'))
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const msg = SubscribeRequest.create('requestId', 'streamId', 0, 'sessionToken')
            assert(msg instanceof SubscribeRequest)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.strictEqual(msg.sessionToken, 'sessionToken')
        })
    })
})
