import assert from 'assert'

import InstructionMessage from '../../../../src/protocol/tracker_layer/instruction_message/InstructionMessage'
import ValidationError from '../../../../src/errors/ValidationError'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'

describe('InstructionMessage', () => {
    describe('constructor', () => {
        it('throws on null counter', () => {
            assert.throws(() => new InstructionMessage({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
                nodeAddresses: [],
                counter: null
            }), ValidationError)
        })
        it('throws on null nodeAddresses', () => {
            assert.throws(() => new InstructionMessage({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
                nodeAddresses: null,
                counter: 1
            }), ValidationError)
        })
        it('throws on null streamPartition', () => {
            assert.throws(() => new InstructionMessage({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: null,
                nodeAddresses: [],
                counter: 1
            }), ValidationError)
        })
        it('throws on null streamId', () => {
            assert.throws(() => new InstructionMessage({
                requestId: 'requestId',
                streamId: null,
                streamPartition: 0,
                nodeAddresses: [],
                counter: 1
            }), ValidationError)
        })
        it('throws on null requestId', () => {
            assert.throws(() => new InstructionMessage({
                requestId: null,
                streamId: 'streamId',
                streamPartition: 0,
                nodeAddresses: [],
                counter: 1
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new InstructionMessage({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
                nodeAddresses: [],
                counter: 1
            })
            assert(msg instanceof InstructionMessage)
            assert.strictEqual(msg.version, TrackerMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.deepStrictEqual(msg.nodeAddresses, [])
            assert.strictEqual(msg.counter, 1)
        })
    })
})
