import assert from 'assert'

import { PublishStreamConnectionResponse, ControlMessage } from '../../../../src/index'

const VERSION = 2
const streamId = 'stream'
const streamPartition = 0
const senderId = 'node'
const accepted = true

// Message definitions
const message = new PublishStreamConnectionResponse({
    version: VERSION,
    streamId,
    streamPartition,
    senderId,
    requestId: 'requestId',
    accepted
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.PublishStreamConnectionResponse, 'requestId', streamId, streamPartition, senderId, accepted])

describe('PublishStreamConnectionResponseSerializerV2', () => {
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
