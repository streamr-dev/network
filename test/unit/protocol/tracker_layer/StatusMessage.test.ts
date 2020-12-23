import assert from 'assert'

import StatusMessage from '../../../../src/protocol/tracker_layer/status_message/StatusMessage'
import ValidationError from '../../../../src/errors/ValidationError'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'

describe('StatusMessage', () => {
    describe('constructor', () => {
        it('throws on null status', () => {
            assert.throws(() => new StatusMessage({
                requestId: 'requestId',
                status: null
            }), ValidationError)
        })
        it('throws on missing status', () => {
            assert.throws(() => new StatusMessage({
                requestId: 'requestId'
            } as any), ValidationError)
        })
        it('throws on null requestId', () => {
            assert.throws(() => new StatusMessage({
                requestId: null as any,
                status: {}
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new StatusMessage({
                requestId: 'requestId',
                // @ts-ignore BUG?
                streamId: 'streamId',
                status: {}
            })
            assert(msg instanceof StatusMessage)
            assert.strictEqual(msg.version, TrackerMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.deepStrictEqual(msg.status, {})
        })
    })
})
