import assert from 'assert'

import { PublishStreamConnectionRequest, ControlMessage, StreamIDUtils } from '../../../../src/index'

const VERSION = 2
const streamId = StreamIDUtils.toStreamID('stream')
const streamPartition = 0
const senderId = 'node'

// Message definitions
const message = new PublishStreamConnectionRequest({
    version: VERSION,
    streamId,
    streamPartition,
    senderId,
    requestId: 'requestId'
})
const serializedMessage = JSON.stringify([
    VERSION,
    ControlMessage.TYPES.PublishStreamConnectionRequest,
    'requestId',
    streamId,
    streamPartition,
    senderId
])

describe('PublishStreamConnectionRequestSerializerV2', () => {
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
