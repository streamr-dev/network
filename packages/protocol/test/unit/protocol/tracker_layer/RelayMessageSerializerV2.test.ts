import assert from 'assert'

import { RelayMessage, RelayMessageSubType } from '../../../../src'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'

const VERSION = 2

// Message definitions
const message = new RelayMessage({
    requestId: 'requestId',
    originator: {
        peerId: 'peerId',
        peerType: 'node',
        controlLayerVersions: [2],
        messageLayerVersions: [32],
        location: 'mock-location'
    },
    targetNode: 'targetNode',
    subType: RelayMessageSubType.RTC_CONNECT,
    data: {
        hello: 'world'
    }
})
const serializedMessage = JSON.stringify([
    VERSION,
    TrackerMessage.TYPES.RelayMessage,
    'requestId',
    {
        peerId: 'peerId',
        peerType: 'node',
        controlLayerVersions: [2],
        messageLayerVersions: [32],
        location: 'mock-location'
    },
    'targetNode',
    RelayMessageSubType.RTC_CONNECT,
    {
        hello: 'world'
    }
])

describe('RelayMessageSerializerV2', () => {
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
