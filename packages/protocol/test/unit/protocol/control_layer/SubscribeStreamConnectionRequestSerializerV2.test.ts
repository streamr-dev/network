import assert from 'assert'

import { SubscribeStreamConnectionRequest, ControlMessage, toStreamID } from '../../../../src/index'

const VERSION = 2
const streamId = toStreamID('stream')
const streamPartition = 0
const senderId = 'node'

// Message definitions
const message = new SubscribeStreamConnectionRequest({
    version: VERSION,
    streamId,
    streamPartition,
    senderId,
    requestId: 'requestId'
})
const serializedMessage = JSON.stringify([
    VERSION,
    ControlMessage.TYPES.SubscribeStreamConnectionRequest,
    'requestId',
    streamId,
    streamPartition,
    senderId
])

describe('SubscribeStreamConnectionRequestSerializerV2', () => {
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
