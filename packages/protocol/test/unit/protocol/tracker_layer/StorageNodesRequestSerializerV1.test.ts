import assert from 'assert'

import '../../../../src/index' // imported for side effects
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'
import StorageNodesRequest from '../../../../src/protocol/tracker_layer/storage_nodes_request/StorageNodesRequest'

const VERSION = 1

// Message definitions
const message = new StorageNodesRequest({
    version: VERSION,
    requestId: 'requestId',
    streamId: 'streamId',
    streamPartition: 10
})
const serializedMessage = JSON.stringify([
    VERSION,
    TrackerMessage.TYPES.StorageNodesRequest,
    'requestId',
    'streamId',
    10
])

describe('StorageNodesRequestSerializerV1', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(TrackerMessage.deserialize(serializedMessage), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(VERSION), serializedMessage)
        })
    })
})
