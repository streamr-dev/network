import assert from 'assert'

import { StreamMessage, MessageRef, MessageID } from '../../../../src/index'

const VERSION = 30

const content = {
    hello: 'world',
}

// Message definitions
const message = new StreamMessage({
    messageId: new MessageID('streamId', 0, 1564046332168, 10, 'publisherId', 'msgChainId'),
    prevMsgRef: new MessageRef(1564046132168, 5),
    content: JSON.stringify(content),
    messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
    encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
    signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
    signature: 'signature',
})
const serializedMessage = JSON.stringify([
    VERSION,
    ['streamId', 0, 1564046332168, 10, 'publisherId', 'msgChainId'],
    [1564046132168, 5],
    StreamMessage.MESSAGE_TYPES.MESSAGE,
    JSON.stringify(content),
    StreamMessage.SIGNATURE_TYPES.ETH,
    'signature'
])

describe('StreamMessageSerializerV30', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            assert.deepStrictEqual(StreamMessage.deserialize(serializedMessage), message)
        })
    })
    describe('serialize', () => {
        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(VERSION), serializedMessage)
        })
    })
})
