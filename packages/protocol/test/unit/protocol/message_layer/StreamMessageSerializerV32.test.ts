import assert from 'assert'

import {
    StreamMessage,
    MessageRef,
    MessageID,
    EncryptedGroupKey,
    toStreamID,
    ValidationError
} from '../../../../src/index'
import { toEthereumAddress } from '@streamr/utils'

const VERSION = 32

const PUBLISHER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

// Message definitions
const message = new StreamMessage({
    messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
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
    ['streamId', 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'],
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

        it('throws if invalid signature type', () => {
            const serializedMessage = JSON.stringify([
                VERSION,
                ['streamId', 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'],
                [1564046132168, 5],
                StreamMessage.MESSAGE_TYPES.MESSAGE,
                StreamMessage.CONTENT_TYPES.JSON,
                StreamMessage.ENCRYPTION_TYPES.AES,
                'groupKeyId',
                'encrypted-content',
                '["groupKeyId","encryptedGroupKeyHex"]',
                0,
                'signature'
            ])
            assert.throws(() => StreamMessage.deserialize(serializedMessage), ValidationError)
        })
    })

    describe('serialize', () => {

        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(VERSION), serializedMessage)
        })
    })
})
