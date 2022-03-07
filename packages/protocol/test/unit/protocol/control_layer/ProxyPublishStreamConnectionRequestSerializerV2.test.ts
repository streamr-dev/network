import assert from 'assert'

import { ProxyPublishStreamConnectionRequest, ControlMessage, toStreamID } from '../../../../src/index'

const VERSION = 2
const streamId = toStreamID('stream')
const streamPartition = 0
const senderId = 'node'

// Message definitions
const message = new ProxyPublishStreamConnectionRequest({
    version: VERSION,
    streamId,
    streamPartition,
    senderId,
    requestId: 'requestId'
})
const serializedMessage = JSON.stringify([
    VERSION,
    ControlMessage.TYPES.ProxyPublishStreamConnectionRequest,
    'requestId',
    streamId,
    streamPartition,
    senderId
])

describe('ProxyPublishStreamConnectionRequestSerializerV2', () => {
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
