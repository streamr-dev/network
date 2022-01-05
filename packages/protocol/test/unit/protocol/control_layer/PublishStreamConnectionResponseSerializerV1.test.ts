import assert from 'assert'

import { PublishStreamConnectionResponse, ControlMessage, toStreamID } from '../../../../src/index'
import { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../../../../src/protocol/control_layer/ControlMessage'

const VERSION = 1
const streamId = toStreamID('stream')
const streamPartition = 0
const senderId = 'node'
const accepted = true

// Message definitions
const message = new PublishStreamConnectionResponse({
    version: VERSION,
    streamId,
    streamPartition,
    senderId,
    accepted,
    requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1,
})
const serializedMessage = JSON.stringify([
    VERSION,
    ControlMessage.TYPES.PublishStreamConnectionResponse,
    streamId,
    streamPartition,
    senderId,
    accepted
])

describe('PublishStreamConnectionResponseSerializerV1', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(ControlMessage.deserialize(serializedMessage), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(VERSION, 30), serializedMessage)
        })
    })
})
