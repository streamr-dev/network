import assert from 'assert'

import { StreamMessage, PublishRequest, ControlMessage } from '../../../../src/index'

const streamMessage = StreamMessage.deserialize([30, ['streamId', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
    [1529549961000, 0], StreamMessage.MESSAGE_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature'])

const VERSION = 2

// Message definitions
const message = new PublishRequest({
    version: VERSION,
    requestId: 'requestId',
    streamMessage,
    sessionToken: 'sessionToken',
})
const serializedMessage = JSON.stringify([VERSION, ControlMessage.TYPES.PublishRequest, 'requestId', JSON.parse(streamMessage.serialize(30)), 'sessionToken'])

describe('PublishRequestSerializerV2', () => {
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
