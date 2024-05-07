import { toEthereumAddress, utf8ToBinary } from '@streamr/utils'
import assert from 'assert'
import ValidationError from '../../../../src/errors/ValidationError'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'
import MessageID from '../../../../src/protocol/message_layer/MessageID'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import StreamMessage, {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessageType
} from '../../../../src/protocol/message_layer/StreamMessage'
import { toStreamID } from '../../../../src/utils/StreamID'
import { StreamPartIDUtils } from '../../../../src/utils/StreamPartID'
import { hexToBinary } from '@streamr/utils'

const content = {
    hello: 'world',
}

const newGroupKey = new EncryptedGroupKey('groupKeyId', hexToBinary('1234'))
const signature = hexToBinary('0x123123')

const msg = ({ timestamp = 1564046332168, sequenceNumber = 10, ...overrides } = {}) => {
    return new StreamMessage({
        messageId: new MessageID(toStreamID('streamId'), 0, timestamp, sequenceNumber, PUBLISHER_ID, 'msgChainId'),
        prevMsgRef: new MessageRef(timestamp, 5),
        content: utf8ToBinary(JSON.stringify(content)),
        contentType: ContentType.JSON,
        messageType: StreamMessageType.MESSAGE,
        encryptionType: EncryptionType.NONE,
        signatureType: SignatureType.SECP256K1,
        signature,
        newGroupKey,
        ...overrides
    })
}

const PUBLISHER_ID = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

describe('StreamMessage', () => {
    describe('constructor', () => {
        it('create a StreamMessage with all fields defined', () => {
            const streamMessage = msg()
            assert.strictEqual(streamMessage.getStreamId(), 'streamId')
            assert.strictEqual(streamMessage.getStreamPartition(), 0)
            assert.strictEqual(streamMessage.getTimestamp(), 1564046332168)
            assert.strictEqual(streamMessage.getSequenceNumber(), 10)
            assert.strictEqual(streamMessage.getPublisherId(), PUBLISHER_ID)
            assert.strictEqual(streamMessage.getMsgChainId(), 'msgChainId')
            assert.deepStrictEqual(streamMessage.prevMsgRef, new MessageRef(1564046332168, 5))
            assert.strictEqual(streamMessage.messageType, StreamMessageType.MESSAGE)
            assert.strictEqual(streamMessage.contentType, ContentType.JSON)
            assert.strictEqual(streamMessage.encryptionType, EncryptionType.NONE)
            assert.strictEqual(streamMessage.groupKeyId, undefined)
            assert.deepStrictEqual(streamMessage.getParsedContent(), content)
            expect(streamMessage.content).toEqual(utf8ToBinary(JSON.stringify(content)))
            assert.strictEqual(streamMessage.signature, signature)
            assert.strictEqual(streamMessage.getStreamPartID(), StreamPartIDUtils.parse('streamId#0'))
        })

        it('create StreamMessage with minimum fields defined', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: utf8ToBinary(JSON.stringify(content)),
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.NONE,
                signatureType: SignatureType.SECP256K1,
                signature
            })
            assert.strictEqual(streamMessage.getStreamId(), 'streamId')
            assert.strictEqual(streamMessage.getStreamPartition(), 0)
            assert.strictEqual(streamMessage.getTimestamp(), 1564046332168)
            assert.strictEqual(streamMessage.getSequenceNumber(), 10)
            assert.strictEqual(streamMessage.getPublisherId(), PUBLISHER_ID)
            assert.strictEqual(streamMessage.getMsgChainId(), 'msgChainId')
            assert.deepStrictEqual(streamMessage.prevMsgRef, undefined)
            assert.strictEqual(streamMessage.messageType, StreamMessageType.MESSAGE)
            assert.strictEqual(streamMessage.contentType, ContentType.JSON)
            assert.strictEqual(streamMessage.encryptionType, EncryptionType.NONE)
            assert.strictEqual(streamMessage.groupKeyId, undefined)
            assert.deepStrictEqual(streamMessage.getParsedContent(), content)
            expect(streamMessage.content).toEqual(utf8ToBinary(JSON.stringify(content)))
            assert.strictEqual(streamMessage.signature, signature)
        })

        it('create StreamMessage binary content', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: new Uint8Array([1, 2, 3]),
                contentType: ContentType.BINARY,
                encryptionType: EncryptionType.NONE,
                signatureType: SignatureType.SECP256K1,
                signature
            })
            assert.strictEqual(streamMessage.getStreamId(), 'streamId')
            assert.strictEqual(streamMessage.getStreamPartition(), 0)
            assert.strictEqual(streamMessage.getTimestamp(), 1564046332168)
            assert.strictEqual(streamMessage.getSequenceNumber(), 10)
            assert.strictEqual(streamMessage.getPublisherId(), PUBLISHER_ID)
            assert.strictEqual(streamMessage.getMsgChainId(), 'msgChainId')
            assert.deepStrictEqual(streamMessage.prevMsgRef, undefined)
            assert.strictEqual(streamMessage.messageType, StreamMessageType.MESSAGE)
            assert.strictEqual(streamMessage.contentType, ContentType.BINARY)
            assert.strictEqual(streamMessage.encryptionType, EncryptionType.NONE)
            assert.strictEqual(streamMessage.groupKeyId, undefined)
            assert.deepStrictEqual(streamMessage.content, new Uint8Array([1, 2, 3]))
            expect(streamMessage.content).toEqual(new Uint8Array([1, 2, 3]))
            assert.strictEqual(streamMessage.signature, signature)
        })

        it('create StreamMessage binary content', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: new Uint8Array([1, 2, 3]),
                contentType: ContentType.BINARY,
                signatureType: SignatureType.SECP256K1,
                encryptionType: EncryptionType.NONE,
                signature
            })
            assert.strictEqual(streamMessage.getStreamId(), 'streamId')
            assert.strictEqual(streamMessage.getStreamPartition(), 0)
            assert.strictEqual(streamMessage.getTimestamp(), 1564046332168)
            assert.strictEqual(streamMessage.getSequenceNumber(), 10)
            assert.strictEqual(streamMessage.getPublisherId(), PUBLISHER_ID)
            assert.strictEqual(streamMessage.getMsgChainId(), 'msgChainId')
            assert.deepStrictEqual(streamMessage.prevMsgRef, undefined)
            assert.strictEqual(streamMessage.messageType, StreamMessageType.MESSAGE)
            assert.strictEqual(streamMessage.contentType, ContentType.BINARY)
            assert.strictEqual(streamMessage.encryptionType, EncryptionType.NONE)
            assert.strictEqual(streamMessage.groupKeyId, undefined)
            assert.deepStrictEqual(streamMessage.content, new Uint8Array([1, 2, 3]))
            assert.strictEqual(streamMessage.newGroupKey, undefined)
            assert.strictEqual(streamMessage.signature, signature)
        })

        it('can detect encrypted', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: utf8ToBinary(JSON.stringify(content)),
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.NONE,
                signatureType: SignatureType.SECP256K1,
                signature
            })
            expect(StreamMessage.isAESEncrypted(streamMessage)).toBe(false)
            const encryptedMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: utf8ToBinary(JSON.stringify(content)),
                contentType: ContentType.JSON,
                signature,
                encryptionType: EncryptionType.AES,
                signatureType: SignatureType.SECP256K1,
                groupKeyId: 'mock-id'
            })

            expect(StreamMessage.isAESEncrypted(encryptedMessage)).toBe(true)
        })

        it('should not throw when encrypted content', () => {
            assert.doesNotThrow(() => msg({
                // @ts-expect-error TODO
                content: utf8ToBinary('encrypted content'),
                encryptionType: EncryptionType.AES,
                groupKeyId: 'mock-id'
            }))
        })

        it('Throws with an no group key for AES encrypted message', () => {
            assert.throws(() => msg({
                encryptionType: EncryptionType.AES
            } as any), ValidationError)
        })

        describe('prevMsgRef validation', () => {
            it('Throws with identical id + prevMsgRef', () => {
                const ts = Date.now()
                assert.throws(() => msg({
                    timestamp: ts,
                    sequenceNumber: 0,
                    // @ts-expect-error TODO
                    prevMsgRef: new MessageRef(ts, 0)
                }), 'must come before current')
            })
            it('Throws with an invalid ts', () => {
                const ts = Date.now()
                assert.throws(() => msg({
                    timestamp: ts,
                    sequenceNumber: 0,
                    // @ts-expect-error TODO
                    prevMsgRef: new MessageRef(ts + 1, 0)
                }), 'must come before current')
            })

            it('Throws with an invalid sequence', () => {
                const ts = Date.now()
                assert.throws(() => msg({
                    timestamp: ts,
                    sequenceNumber: 0,
                    // @ts-expect-error TODO
                    prevMsgRef: new MessageRef(ts, 1)
                }), 'must come before current')
            })

            it('Throws with an invalid ts + seq', () => {
                const ts = Date.now()
                assert.throws(() => msg({
                    timestamp: ts,
                    sequenceNumber: 0,
                    // @ts-expect-error TODO
                    prevMsgRef: new MessageRef(ts + 1, 1)
                }), 'must come before current')
            })

            it('works with valid seq', () => {
                const ts = Date.now()
                msg({
                    timestamp: ts,
                    sequenceNumber: 1,
                    // @ts-expect-error TODO
                    prevMsgRef: new MessageRef(ts, 0)
                })
            })

            it('works with valid ts', () => {
                const ts = Date.now()
                msg({
                    timestamp: ts,
                    sequenceNumber: 0,
                    // @ts-expect-error TODO
                    prevMsgRef: new MessageRef(ts - 1, 0)
                })
            })

            it('works with no prevMsgRef', () => {
                const ts = Date.now()
                msg({
                    timestamp: ts,
                    sequenceNumber: 0,
                    // @ts-expect-error TODO
                    prevMsgRef: undefined
                })
            })
        })

        describe('copy constructor', () => {
            it('can nullify fields', () => {
                const message = new StreamMessage({
                    messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                    content: new Uint8Array([1, 2, 3, 4, 5]),
                    contentType: ContentType.BINARY,
                    encryptionType: EncryptionType.AES,
                    signatureType: SignatureType.SECP256K1,
                    signature,
                    groupKeyId: 'foo',
                    newGroupKey: new EncryptedGroupKey('bar', new Uint8Array([1, 2, 3])),
                    prevMsgRef: new MessageRef(1564046332168, 5),
                })
                const copyWithFieldsNullified = new StreamMessage({
                    ...message,
                    encryptionType: EncryptionType.NONE,
                    groupKeyId: undefined,
                    newGroupKey: undefined,
                    prevMsgRef: undefined,
                })
                expect(copyWithFieldsNullified.messageId).toEqual(message.messageId)
                expect(copyWithFieldsNullified.encryptionType).toEqual(EncryptionType.NONE)
                expect(copyWithFieldsNullified.groupKeyId).toEqual(undefined)
                expect(copyWithFieldsNullified.newGroupKey).toEqual(undefined)
                expect(copyWithFieldsNullified.prevMsgRef).toEqual(undefined)
            })
        })
    })
})
