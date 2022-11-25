import { toEthereumAddress } from '@streamr/utils'
import assert from 'assert'
import ValidationError from '../../../../src/errors/ValidationError'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'
import MessageID from '../../../../src/protocol/message_layer/MessageID'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import StreamMessage, { ContentType, EncryptionType, StreamMessageType } from '../../../../src/protocol/message_layer/StreamMessage'
import { SIGNATURE_TYPE_ETH } from '../../../../src/protocol/message_layer/StreamMessageSerializerV32'
import { toStreamID } from '../../../../src/utils/StreamID'

const VERSION = 32

const PUBLISHER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

// Message definitions
const message = new StreamMessage({
    messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
    prevMsgRef: new MessageRef(1564046132168, 5),
    content: 'encrypted-content',
    messageType: StreamMessageType.MESSAGE,
    contentType: ContentType.JSON,
    groupKeyId: 'groupKeyId',
    encryptionType: EncryptionType.AES,
    newGroupKey: new EncryptedGroupKey('groupKeyId', 'encryptedGroupKeyHex', '["groupKeyId","encryptedGroupKeyHex"]'),
    signature: 'signature',
})
const serializedMessage = JSON.stringify([
    VERSION,
    ['streamId', 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'],
    [1564046132168, 5],
    StreamMessageType.MESSAGE,
    ContentType.JSON,
    EncryptionType.AES,
    'groupKeyId',
    'encrypted-content',
    '["groupKeyId","encryptedGroupKeyHex"]',
    SIGNATURE_TYPE_ETH,
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
                StreamMessageType.MESSAGE,
                ContentType.JSON,
                EncryptionType.AES,
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
