import assert from 'assert'

import { MessageLayer } from '../../../../src/index'

const { StreamMessage, MessageRef, MessageIDStrict } = MessageLayer

const VERSION = 31

const content = {
    hello: 'world',
}

// Message definitions
const message = new StreamMessage({
    messageId: new MessageIDStrict('streamId', 0, 1564046332168, 10, 'publisherId', 'msgChainId'),
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
    StreamMessage.ENCRYPTION_TYPES.NONE,
    JSON.stringify(content),
    StreamMessage.SIGNATURE_TYPES.ETH,
    'signature'
])

describe('StreamMessageSerializerV31', () => {
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
