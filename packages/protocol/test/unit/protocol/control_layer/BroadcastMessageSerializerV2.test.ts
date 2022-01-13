import assert from 'assert'

import { StreamMessage, BroadcastMessage, ControlMessage, ContentType, EncryptionType } from '../../../../src/index'

const streamMessage = StreamMessage.deserialize([32, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
    [1529549961000, 0], StreamMessage.MESSAGE_TYPES.MESSAGE, ContentType.JSON, EncryptionType.NONE, null, '{"valid": "json"}', null, StreamMessage.SIGNATURE_TYPES.ETH, 'signature'])

const VERSION = 2

// Message definitions
const message = new BroadcastMessage({
    version: VERSION,
    requestId: 'requestId',
    streamMessage,
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.BroadcastMessage, 'requestId', JSON.parse(streamMessage.serialize(32))])

describe('BroadcastMessageSerializerV2', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(ControlMessage.deserialize(serializedMessage), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(VERSION, 32), serializedMessage)
        })
    })
})
