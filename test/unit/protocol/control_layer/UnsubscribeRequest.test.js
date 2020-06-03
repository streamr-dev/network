import assert from 'assert'

import UnsubscribeRequest from '../../../../src/protocol/control_layer/unsubscribe_request/UnsubscribeRequest'
import ControlMessage from '../../../../src/protocol/control_layer/ControlMessage'
import ValidationError from '../../../../src/errors/ValidationError'

describe('UnsubscribeRequest', () => {
    describe('constructor', () => {
        it('throws on null streamId', () => {
            assert.throws(() => new UnsubscribeRequest({
                requestId: 'requestId',
                streamId: null,
                streamPartition: 0,
            }), ValidationError)
        })
        it('throws on null streamPartition', () => {
            assert.throws(() => new UnsubscribeRequest({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: null,
            }), ValidationError)
        })
        it('throws on null requestId (since V2)', () => {
            assert.throws(() => new UnsubscribeRequest({
                requestId: null,
                streamId: 'streamId',
                streamPartition: 0,
            }), ValidationError)
        })
        it('does not throw on null requestId (before V2)', () => {
            assert.doesNotThrow(() => new UnsubscribeRequest({
                version: 1,
                requestId: null,
                streamId: 'streamId',
                streamPartition: 0,
            }))
        })
        it('should create the latest version', () => {
            const msg = new UnsubscribeRequest({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
            })
            assert(msg instanceof UnsubscribeRequest)
            assert.strictEqual(msg.version, ControlMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
        })
    })
})
