import assert from 'assert'

import { ProxySubscribeStreamConnectionResponse, ControlMessage, toStreamID } from '../../../../src/index'

const VERSION = 2
const streamId = toStreamID('stream')
const streamPartition = 0
const senderId = 'node'
const accepted = true

// Message definitions
const message = new ProxySubscribeStreamConnectionResponse({
    version: VERSION,
    streamId,
    streamPartition,
    senderId,
    requestId: 'requestId',
    accepted
})
const serializedMessage = JSON.stringify([
    VERSION,
    ControlMessage.TYPES.ProxySubscribeStreamConnectionResponse,
    'requestId',
    streamId,
    streamPartition,
    senderId,
    accepted
])

describe('ProxySubscribeStreamConnectionResponseSerializerV2', () => {
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
