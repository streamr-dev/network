import assert from 'assert'

import StorageNodesResponse from '../../../../src/protocol/tracker_layer/storage_nodes_response/StorageNodesResponse'
import ValidationError from '../../../../src/errors/ValidationError'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'

describe('StorageNodesResponse', () => {
    describe('constructor', () => {
        it('throws on null nodeIds', () => {
            assert.throws(() => new StorageNodesResponse({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
                nodeIds: null
            }), ValidationError)
        })
        it('throws on null streamPartition', () => {
            assert.throws(() => new StorageNodesResponse({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: null,
                nodeIds: []
            }), ValidationError)
        })
        it('throws on null streamId', () => {
            assert.throws(() => new StorageNodesResponse({
                requestId: 'requestId',
                streamId: null,
                streamPartition: 0,
                nodeIds: []
            }), ValidationError)
        })
        it('throws on null requestId', () => {
            assert.throws(() => new StorageNodesResponse({
                requestId: null,
                streamId: 'streamId',
                streamPartition: 0,
                nodeIds: []
            }), ValidationError)
        })
        it('should create the latest version', () => {
            const msg = new StorageNodesResponse({
                requestId: 'requestId',
                streamId: 'streamId',
                streamPartition: 0,
                nodeIds: []
            })
            assert(msg instanceof StorageNodesResponse)
            assert.strictEqual(msg.version, TrackerMessage.LATEST_VERSION)
            assert.strictEqual(msg.requestId, 'requestId')
            assert.strictEqual(msg.streamId, 'streamId')
            assert.strictEqual(msg.streamPartition, 0)
            assert.deepStrictEqual(msg.nodeIds, [])
        })
    })
})
