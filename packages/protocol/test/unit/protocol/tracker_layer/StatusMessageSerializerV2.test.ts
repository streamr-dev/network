import assert from 'assert'
import StatusMessage from '../../../../src/protocol/tracker_layer/status_message/StatusMessage'
import '../../../../src/protocol/tracker_layer/status_message/StatusMessageSerializerV2'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'

const VERSION = 2

// Message definitions
const message = new StatusMessage({
    version: VERSION,
    requestId: 'requestId',
    status: {}
})
const serializedMessage = JSON.stringify([VERSION, TrackerMessage.TYPES.StatusMessage, 'requestId', {}])

describe('StatusMessageSerializerV2', () => {
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
