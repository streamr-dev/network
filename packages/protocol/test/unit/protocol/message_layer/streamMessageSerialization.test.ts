import { toEthereumAddress, hexToBinary } from '@streamr/utils'
import assert from 'assert'
import ValidationError from '../../../../src/errors/ValidationError'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'
import MessageID from '../../../../src/protocol/message_layer/MessageID'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import StreamMessage, { ContentType, EncryptionType, StreamMessageType, VERSION } from '../../../../src/protocol/message_layer/StreamMessage'
import { toStreamID } from '../../../../src/utils/StreamID'
import { SIGNATURE_TYPE_ETH } from '../../../../src/protocol/message_layer/streamMessageSerialization'

const PUBLISHER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const signature = '111233'

// Message definitions
const message = new StreamMessage({
    messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
    prevMsgRef: new MessageRef(1564046132168, 5),
    content: 'encrypted-content',
    messageType: StreamMessageType.MESSAGE,
    contentType: ContentType.JSON,
    groupKeyId: 'groupKeyId',
    encryptionType: EncryptionType.AES,
    newGroupKey: new EncryptedGroupKey('groupKeyId', hexToBinary('1234'), '["groupKeyId","1234"]'),
    signature: hexToBinary(signature),
})
const serializedMessage = JSON.stringify([
    VERSION,
    ['streamId', 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'],
    [1564046132168, 5],
    StreamMessageType.MESSAGE,
    ContentType.JSON,
    EncryptionType.AES,
    'groupKeyId',
    '656e637279707465642d636f6e74656e74',
    '["groupKeyId","1234"]',
    SIGNATURE_TYPE_ETH,
    signature
])

describe('streamMessageSerialization', () => {

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
                '["groupKeyId","1234"]',
                0,
                signature
            ])
            assert.throws(() => StreamMessage.deserialize(serializedMessage), ValidationError)
        })
    })

    describe('serialize', () => {

        it('correctly serializes messages', () => {
            assert.deepStrictEqual(message.serialize(), serializedMessage)
        })
    })
})
