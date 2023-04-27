import { toEthereumAddress } from '@streamr/utils'
import assert from 'assert'
import UnsupportedVersionError from '../../../../src/errors/UnsupportedVersionError'
import ValidationError from '../../../../src/errors/ValidationError'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'
import MessageID from '../../../../src/protocol/message_layer/MessageID'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import StreamMessage, { ContentType, EncryptionType, StreamMessageType } from '../../../../src/protocol/message_layer/StreamMessage'
import '../../../../src/protocol/message_layer/StreamMessageSerializerV32'
import { Serializer } from '../../../../src/Serializer'
import { toStreamID } from '../../../../src/utils/StreamID'
import { StreamPartIDUtils } from '../../../../src/utils/StreamPartID'
import { merge } from '@streamr/utils'

const content = {
    hello: 'world',
}

const newGroupKey = new EncryptedGroupKey('groupKeyId', 'encryptedGroupKeyHex')

const msg = ({ timestamp = 1564046332168, sequenceNumber = 10, ...overrides } = {}) => {
    return new StreamMessage(
        merge(
            {
                messageId: new MessageID(toStreamID('streamId'), 0, timestamp, sequenceNumber, PUBLISHER_ID, 'msgChainId'),
                prevMsgRef: new MessageRef(timestamp, 5),
                content: JSON.stringify(content),
                messageType: StreamMessageType.MESSAGE,
                encryptionType: EncryptionType.NONE,
                signature: 'signature',
                newGroupKey
            },
            overrides
        )
    )
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
            assert.strictEqual(streamMessage.groupKeyId, null)
            assert.deepStrictEqual(streamMessage.getContent(), content)
            assert.strictEqual(streamMessage.getSerializedContent(), JSON.stringify(content))
            assert.deepStrictEqual(streamMessage.getNewGroupKey(), newGroupKey)
            assert.strictEqual(streamMessage.signature, 'signature')
            assert.strictEqual(streamMessage.getStreamPartID(), StreamPartIDUtils.parse('streamId#0'))
        })

        it('create StreamMessage with minimum fields defined', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: JSON.stringify(content),
                signature: 'signature'
            })
            assert.strictEqual(streamMessage.getStreamId(), 'streamId')
            assert.strictEqual(streamMessage.getStreamPartition(), 0)
            assert.strictEqual(streamMessage.getTimestamp(), 1564046332168)
            assert.strictEqual(streamMessage.getSequenceNumber(), 10)
            assert.strictEqual(streamMessage.getPublisherId(), PUBLISHER_ID)
            assert.strictEqual(streamMessage.getMsgChainId(), 'msgChainId')
            assert.deepStrictEqual(streamMessage.prevMsgRef, null)
            assert.strictEqual(streamMessage.messageType, StreamMessageType.MESSAGE)
            assert.strictEqual(streamMessage.contentType, ContentType.JSON)
            assert.strictEqual(streamMessage.encryptionType, EncryptionType.NONE)
            assert.strictEqual(streamMessage.groupKeyId, null)
            assert.deepStrictEqual(streamMessage.getContent(), content)
            assert.strictEqual(streamMessage.getSerializedContent(), JSON.stringify(content))
            assert.strictEqual(streamMessage.getNewGroupKey(), null)
            assert.strictEqual(streamMessage.signature, 'signature')
        })

        it('create StreamMessage with object as content instead of string', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content,
                signature: 'signature'
            })
            assert.deepStrictEqual(streamMessage.getContent(), content)
            assert.strictEqual(streamMessage.getSerializedContent(), JSON.stringify(content))
        })

        it('can detect encrypted', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: JSON.stringify(content),
                signature: 'something'
            })
            expect(StreamMessage.isAESEncrypted(streamMessage)).toBe(false)
            const encryptedMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: JSON.stringify(content),
                signature: 'something',
                encryptionType: EncryptionType.AES,
                groupKeyId: 'mock-id'
            })

            expect(StreamMessage.isAESEncrypted(encryptedMessage)).toBe(true)
        })

        it('should throw if required fields are not defined', () => {
            assert.throws(() => new StreamMessage({
                // missing messageId
                content: JSON.stringify(content),
            } as any), ValidationError)
        })

        it('should throw if content is not defined', () => {
            assert.throws(() => new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                // missing content
            } as any), ValidationError)
        })

        it('should not throw when encrypted content', () => {
            assert.doesNotThrow(() => msg({
                // @ts-expect-error TODO
                content: 'encrypted content',
                encryptionType: EncryptionType.AES,
                groupKeyId: 'mock-id'
            }))
        })

        it('Throws with an invalid content type', () => {
            assert.throws(() => msg({
                // @ts-expect-error TODO
                contentType: 999, // invalid
            }), ValidationError)
        })

        it('Throws with an invalid newGroupKey', () => {
            assert.throws(() => msg({
                // @ts-expect-error TODO
                newGroupKey: 'foo', // invalid
            }), ValidationError)
        })

        it('Throws with an no group key for AES encrypted message', () => {
            assert.throws(() => msg({
                encryptionType: EncryptionType.AES,
                groupKeyId: null
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
                    prevMsgRef: null
                })
            })
        })
    })

    describe('clone', () => {
        it('works', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: JSON.stringify(content),
                signature: 'signature'
            })
            const streamMessageClone = streamMessage.clone()
            expect(streamMessageClone).not.toBe(streamMessage)
            expect(streamMessageClone.serialize()).toEqual(streamMessage.serialize())
        })

        it('works with encrypted messages', () => {
            const encryptedMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: JSON.stringify(content),
                signature: 'something',
                encryptionType: EncryptionType.RSA,
                prevMsgRef: new MessageRef(1564046332168, 5),
            })
            const streamMessageClone = encryptedMessage.clone()
            expect(streamMessageClone).not.toBe(encryptedMessage)
            expect(streamMessageClone.messageId).not.toBe(encryptedMessage.messageId)
            expect(streamMessageClone.prevMsgRef).not.toBe(encryptedMessage.prevMsgRef)
            expect(encryptedMessage.encryptionType).toEqual(EncryptionType.RSA)
            expect(streamMessageClone.encryptionType).toEqual(EncryptionType.RSA)
            expect(streamMessageClone.encryptionType).toEqual(encryptedMessage.encryptionType)
            expect(streamMessageClone.serialize()).toEqual(encryptedMessage.serialize())
        })
    })

    describe('serialization', () => {
        let serializer: Serializer<StreamMessage>
        const VERSION = StreamMessage.LATEST_VERSION + 100

        beforeEach(() => {
            serializer = {
                fromArray: jest.fn(),
                toArray: jest.fn(),
            }
            StreamMessage.unregisterSerializer(VERSION)
            StreamMessage.registerSerializer(VERSION, serializer)
        })

        afterEach(() => {
            StreamMessage.unregisterSerializer(VERSION)
        })

        describe('registerSerializer', () => {
            beforeEach(() => {
                // Start from a clean slate
                StreamMessage.unregisterSerializer(VERSION)
            })

            it('registers a Serializer retrievable by getSerializer()', () => {
                StreamMessage.registerSerializer(VERSION, serializer)
                assert.strictEqual(StreamMessage.getSerializer(VERSION), serializer)
            })
            it('throws if the Serializer for a version is already registered', () => {
                StreamMessage.registerSerializer(VERSION, serializer)
                assert.throws(() => StreamMessage.registerSerializer(VERSION, serializer))
            })
            it('throws if the Serializer does not implement fromArray', () => {
                const invalidSerializer: any = {
                    toArray: jest.fn()
                }
                assert.throws(() => StreamMessage.registerSerializer(VERSION, invalidSerializer))
            })
            it('throws if the Serializer does not implement toArray', () => {
                const invalidSerializer: any = {
                    fromArray: jest.fn()
                }
                assert.throws(() => StreamMessage.registerSerializer(VERSION, invalidSerializer))
            })
        })

        describe('serialize', () => {
            const m = msg()

            it('calls toArray() on the configured serializer and stringifies it', () => {
                serializer.toArray = jest.fn().mockReturnValue([12345])
                assert.strictEqual(m.serialize(VERSION), '[12345]')
                expect(serializer.toArray).toBeCalledWith(m)
            })

            it('should throw on unsupported version', () => {
                assert.throws(() => m.serialize(999), (err: UnsupportedVersionError) => {
                    assert(err instanceof UnsupportedVersionError)
                    assert.strictEqual(err.version, 999)
                    return true
                })
            })
        })

        describe('deserialize', () => {
            it('parses the input, reads version, and calls fromArray() on the configured serializer', () => {
                const arr = [VERSION]
                const m = msg()
                serializer.fromArray = jest.fn().mockReturnValue(m)
                assert.strictEqual(StreamMessage.deserialize(JSON.stringify(arr)), m)
                expect(serializer.fromArray).toBeCalledWith(arr)
            })

            it('should throw on unsupported version', () => {
                const arr = [999]
                assert.throws(() => StreamMessage.deserialize(JSON.stringify(arr)), (err: UnsupportedVersionError) => {
                    assert(err instanceof UnsupportedVersionError)
                    assert.strictEqual(err.version, 999)
                    return true
                })
            })
        })

        it('returns an array of registered versions', () => {
            assert(StreamMessage.getSupportedVersions().indexOf(VERSION) >= 0)
            assert(StreamMessage.getSupportedVersions().indexOf(999) < 0)
        })
    })
})
