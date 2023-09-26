import { toEthereumAddress, utf8ToBinary } from '@streamr/utils'
import assert from 'assert'
import ValidationError from '../../../../src/errors/ValidationError'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'
import MessageID from '../../../../src/protocol/message_layer/MessageID'
import MessageRef from '../../../../src/protocol/message_layer/MessageRef'
import StreamMessage, { ContentType, EncryptionType, StreamMessageType } from '../../../../src/protocol/message_layer/StreamMessage'
import { toStreamID } from '../../../../src/utils/StreamID'
import { StreamPartIDUtils } from '../../../../src/utils/StreamPartID'
import { merge, hexToBinary } from '@streamr/utils'

const content = {
    hello: 'world',
}

const newGroupKey = new EncryptedGroupKey('groupKeyId', hexToBinary('1234'))
const signature = hexToBinary('0x123123')

const msg = ({ timestamp = 1564046332168, sequenceNumber = 10, ...overrides } = {}) => {
    return new StreamMessage(
        merge(
            {
                messageId: new MessageID(toStreamID('streamId'), 0, timestamp, sequenceNumber, PUBLISHER_ID, 'msgChainId'),
                prevMsgRef: new MessageRef(timestamp, 5),
                content: utf8ToBinary(JSON.stringify(content)),
                messageType: StreamMessageType.MESSAGE,
                encryptionType: EncryptionType.NONE,
                signature,
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
            expect(streamMessage.getSerializedContent()).toEqual(utf8ToBinary(JSON.stringify(content)))
            assert.deepStrictEqual(streamMessage.getNewGroupKey(), newGroupKey)
            assert.strictEqual(streamMessage.signature, signature)
            assert.strictEqual(streamMessage.getStreamPartID(), StreamPartIDUtils.parse('streamId#0'))
        })

        it('create StreamMessage with minimum fields defined', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: utf8ToBinary(JSON.stringify(content)),
                signature
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
            expect(streamMessage.getSerializedContent()).toEqual(utf8ToBinary(JSON.stringify(content)))
            assert.strictEqual(streamMessage.getNewGroupKey(), null)
            assert.strictEqual(streamMessage.signature, signature)
        })

        it('can detect encrypted', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: utf8ToBinary(JSON.stringify(content)),
                signature
            })
            expect(StreamMessage.isAESEncrypted(streamMessage)).toBe(false)
            const encryptedMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: utf8ToBinary(JSON.stringify(content)),
                signature,
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
                content: utf8ToBinary('encrypted content'),
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
                content: utf8ToBinary(JSON.stringify(content)),
                signature
            })
            const streamMessageClone = streamMessage.clone()
            expect(streamMessageClone).not.toBe(streamMessage)
            expect(streamMessageClone.serialize()).toEqual(streamMessage.serialize())
        })

        it('works with encrypted messages', () => {
            const encryptedMessage = new StreamMessage({
                messageId: new MessageID(toStreamID('streamId'), 0, 1564046332168, 10, PUBLISHER_ID, 'msgChainId'),
                content: utf8ToBinary(JSON.stringify(content)),
                signature,
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
})
