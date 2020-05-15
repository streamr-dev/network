import assert from 'assert'

import UnsubscribeResponse from '../../../../src/protocol/control_layer/unsubscribe_response/UnsubscribeResponse'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('UnsubscribeResponse', () => {
    describe('validation', () => {
        it('throws on null streamId', () => {
            assert.throws(() => new UnsubscribeResponse(ControlMessage.LATEST_VERSION, 'requestId', null, 0, 'sessionToken'), ValidationError)
        })
        it('throws on null streamPartition', () => {
            assert.throws(() => new UnsubscribeResponse(ControlMessage.LATEST_VERSION, 'requestId', 'streamId', null, 'sessionToken'), ValidationError)
        })
        it('throws on null requestId (since V2)', () => {
            assert.throws(() => new UnsubscribeResponse(ControlMessage.LATEST_VERSION, null, 'streamId', 0, 'sessionToken'), ValidationError)
        })
        it('does not throw on null requestId (before V2)', () => {
            assert.doesNotThrow(() => new UnsubscribeResponse(1, null, 'streamId', 0, 'sessionToken'))
        })
    })

    describe('create', () => {
        it('should create the latest version', () => {
            const msg = UnsubscribeResponse.create('requestId', 'streamId', 0)
            assert(msg instanceof UnsubscribeResponse)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
        })
    })
})
