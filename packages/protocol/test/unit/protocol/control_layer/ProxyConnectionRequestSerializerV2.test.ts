import assert from 'assert'

import { ProxyConnectionRequest, ControlMessage, toStreamID } from '../../../../src/index'
import { ProxyDirection } from '../../../../src/utils/types'

const VERSION = 2
const streamId = toStreamID('stream')
const streamPartition = 0
const senderId = 'node'
const direction = ProxyDirection.SUBSCRIBE
const userId = 'mockUser'

// Message definitions
const message = new ProxyConnectionRequest({
    version: VERSION,
    streamId,
    streamPartition,
    direction,
    senderId,
    requestId: 'requestId',
    userId
})
const serializedMessage = JSON.stringify([
    VERSION,
    ControlMessage.TYPES.ProxyConnectionRequest,
    'requestId',
    streamId,
    streamPartition,
    senderId,
    direction,
    userId
])

describe('ProxyConnectionRequestSerializerV2', () => {
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
