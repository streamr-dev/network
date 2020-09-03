import assert from 'assert'

import StorageNodesRequest from '../../../../src/protocol/tracker_layer/storage_nodes_request/StorageNodesRequest'
import ValidationError from '../../../../src/errors/ValidationError'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'

describe('StorageNodesRequest', () => {
    describe('constructor', () => {
        it('throws on null streamPartition', () => {
            assert.throws(() => new StorageNodesRequest({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: null
            }), ValidationError)
        })
        it('throws on null streamId', () => {
            assert.throws(() => new StorageNodesRequest({
                requestId: 'requestId',
                streamId: null,
                streamPartition: 0
            }), ValidationError)
        })
        it('throws on null requestId', () => {
            assert.throws(() => new StorageNodesRequest({
                requestId: null,
                streamId: 'streamId',
                streamPartition: 0
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new StorageNodesRequest({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0
            })
            assert(msg instanceof StorageNodesRequest)
            assert.strictEqual(msg.version, TrackerMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
        })
    })
})
