import assert from 'assert'
import StatusAckMessage from '../../../../src/protocol/tracker_layer/status_ack_message/StatusAckMessage'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 2

// Message definitions
const message = new StatusAckMessage({
    version: VERSION,
    requestId: 'requestId',
    streamId: toStreamID('streamId'),
    streamPartition: 10
})
const serializedMessage = JSON.stringify([
    VERSION,
    TrackerMessage.TYPES.StatusAckMessage,
    'requestId',
    'streamId',
    10
])

describe('StatusAckMessageSerializerV2', () => {
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
