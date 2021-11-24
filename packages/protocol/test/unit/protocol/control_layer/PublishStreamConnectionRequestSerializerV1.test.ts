import assert from 'assert'

import { PublishStreamConnectionRequest, ControlMessage } from '../../../../src/index'
import { PLACEHOLDER_REQUEST_ID_PROTOCOL_V1 } from '../../../../src/protocol/control_layer/ControlMessage'

const VERSION = 1
const streamId = 'stream'
const streamPartition = 0
const senderId = 'node'

// Message definitions
const message = new PublishStreamConnectionRequest({
    version: VERSION,
    streamId,
    streamPartition,
    senderId,
    requestId: PLACEHOLDER_REQUEST_ID_PROTOCOL_V1
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.PublishStreamConnectionRequest, streamId, streamPartition, senderId])

describe('PublishStreamConnectionRequestSerializerV1', () => {
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
