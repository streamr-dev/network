import assert from 'assert'

import UnsubscribeRequest from '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequest'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('UnsubscribeRequest', () => {
    describe('validation', () => {
        it('throws on null streamId', () => {
            assert.throws(() => new UnsubscribeRequest(ControlMessage.LATEST_VERSION, 'requestId', null, 0), ValidationError)
        })
        it('throws on null streamPartition', () => {
            assert.throws(() => new UnsubscribeRequest(ControlMessage.LATEST_VERSION, 'requestId', 'streamId', null), ValidationError)
        })
        it('throws on null requestId (since V2)', () => {
            assert.throws(() => new UnsubscribeRequest(ControlMessage.LATEST_VERSION, null, 'streamId', 0), ValidationError)
        })
        it('does not throw on null requestId (before V2)', () => {
            assert.doesNotThrow(() => new UnsubscribeRequest(1, null, 'streamId', 0))
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const msg = UnsubscribeRequest.create('requestId', 'streamId', 0, 'sessionToken')
            assert(msg instanceof UnsubscribeRequest)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
        })
    })
})
