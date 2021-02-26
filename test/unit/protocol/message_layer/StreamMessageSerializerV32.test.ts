import assert from 'assert'

import { StreamMessage, MessageRef, MessageIDStrict, EncryptedGroupKey } from '../../../../src/index'

const VERSION = 32

// Message definitions
const message = new StreamMessage({
    messageId: new MessageIDStrict('streamId', 0, 1564046332168, 10, 'publisherId', 'msgChainId'),
    prevMsgRef: new MessageRef(1564046132168, 5),
    content: 'encrypted-content',
    messageType: StreamMessage.MESSAGE_TYPES.MESSAGE,
    contentType: StreamMessage.CONTENT_TYPES.JSON,
    groupKeyId: 'groupKeyId',
    encryptionType: StreamMessage.ENCRYPTION_TYPES.AES,
    newGroupKey: new EncryptedGroupKey('groupKeyId', 'encryptedGroupKeyHex', '["groupKeyId","encryptedGroupKeyHex"]'),
    signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
    signature: 'signature',
})
const serializedMessage = JSON.stringify([
    VERSION,
    ['streamId', 0, 1564046332168, 10, 'publisherId', 'msgChainId'],
    [1564046132168, 5],
    StreamMessage.MESSAGE_TYPES.MESSAGE,
    StreamMessage.CONTENT_TYPES.JSON,
    StreamMessage.ENCRYPTION_TYPES.AES,
    'groupKeyId',
    'encrypted-content',
    '["groupKeyId","encryptedGroupKeyHex"]',
    StreamMessage.SIGNATURE_TYPES.ETH,
    'signature'
])

describe('StreamMessageSerializerV32', () => {
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
