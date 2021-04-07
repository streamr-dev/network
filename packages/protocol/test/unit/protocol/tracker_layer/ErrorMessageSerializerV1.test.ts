import assert from 'assert'

import { TrackerLayer } from '../../../../src'
import TrackerMessage from '../../../../src/protocol/tracker_layer/TrackerMessage'

const { ErrorMessage } = TrackerLayer

const VERSION = 1

// Message definitions
const message = new ErrorMessage({
    version: VERSION,
    requestId: 'requestId',
    errorCode: ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
    targetNode: 'targetNode'
})
const serializedMessage = JSON.stringify([
    VERSION,
    TrackerMessage.TYPES.ErrorMessage,
    'requestId',
    ErrorMessage.ERROR_CODES.RTC_UNKNOWN_PEER,
    'targetNode'
])

describe('ErrorMessageSerializerV1', () => {
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
