import assert from 'assert'

import { SubscribeStreamConnectionResponse, ControlMessage, toStreamID } from '../../../../src/index'

const VERSION = 2
const streamId = toStreamID('stream')
const streamPartition = 0
const senderId = 'node'
const accepted = true

// Message definitions
const message = new SubscribeStreamConnectionResponse({
    version: VERSION,
    streamId,
    streamPartition,
    senderId,
    requestId: 'requestId',
    accepted
})
const serializedMessage = JSON.stringify([
    VERSION,
    ControlMessage.TYPES.SubscribeStreamConnectionResponse,
    'requestId',
    streamId,
    streamPartition,
    senderId,
    accepted
])

describe('SubscribeStreamConnectionResponseSerializerV2', () => {
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
