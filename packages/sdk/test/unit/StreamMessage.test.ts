import { randomUserId } from '@streamr/test-utils'
import { StreamPartIDUtils, hexToBinary, toStreamID, utf8ToBinary } from '@streamr/utils'
import { EncryptedGroupKey } from '../../src/protocol/EncryptedGroupKey'
import { MessageID } from '../../src/protocol/MessageID'
import { MessageRef } from '../../src/protocol/MessageRef'
import {
    ContentType,
    EncryptionType,
    SignatureType,
    StreamMessage,
    StreamMessageType
} from '../../src/protocol/StreamMessage'
import { ValidationError } from '../../src/protocol/ValidationError'

const content = {
    hello: 'world'
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

const PUBLISHER_ID = randomUserId()

describe('StreamMessage', () => {
    describe('constructor', () => {
        it('create a StreamMessage with all fields defined', () => {
            const streamMessage = msg()
            expect(streamMessage.getStreamId()).toEqual('streamId')
            expect(streamMessage.getStreamPartition()).toEqual(0)
            expect(streamMessage.getTimestamp()).toEqual(1564046332168)
            expect(streamMessage.getSequenceNumber()).toEqual(10)
            expect(streamMessage.getPublisherId()).toEqual(PUBLISHER_ID)
            expect(streamMessage.getMsgChainId()).toEqual('msgChainId')
            expect(streamMessage.prevMsgRef).toEqual(new MessageRef(1564046332168, 5))
            expect(streamMessage.messageType).toEqual(StreamMessageType.MESSAGE)
            expect(streamMessage.contentType).toEqual(ContentType.JSON)
            expect(streamMessage.encryptionType).toEqual(EncryptionType.NONE)
            expect(streamMessage.groupKeyId).toBeUndefined()
            expect(streamMessage.getParsedContent()).toEqual(content)
            expect(streamMessage.content).toEqualBinary(utf8ToBinary(JSON.stringify(content)))
            expect(streamMessage.signature).toEqualBinary(signature)
            expect(streamMessage.getStreamPartID()).toEqual(StreamPartIDUtils.parse('streamId#0'))
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
            expect(streamMessage.getStreamId()).toEqual('streamId')
            expect(streamMessage.getStreamPartition()).toEqual(0)
            expect(streamMessage.getTimestamp()).toEqual(1564046332168)
            expect(streamMessage.getSequenceNumber()).toEqual(10)
            expect(streamMessage.getPublisherId()).toEqual(PUBLISHER_ID)
            expect(streamMessage.getMsgChainId()).toEqual('msgChainId')
            expect(streamMessage.prevMsgRef).toBeUndefined()
            expect(streamMessage.messageType).toEqual(StreamMessageType.MESSAGE)
            expect(streamMessage.contentType).toEqual(ContentType.JSON)
            expect(streamMessage.encryptionType).toEqual(EncryptionType.NONE)
            expect(streamMessage.groupKeyId).toBeUndefined()
            expect(streamMessage.getParsedContent()).toEqual(content)
            expect(streamMessage.content).toEqualBinary(utf8ToBinary(JSON.stringify(content)))
            expect(streamMessage.signature).toEqualBinary(signature)
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
            expect(streamMessage.getStreamId()).toEqual('streamId')
            expect(streamMessage.getStreamPartition()).toEqual(0)
            expect(streamMessage.getTimestamp()).toEqual(1564046332168)
            expect(streamMessage.getSequenceNumber()).toEqual(10)
            expect(streamMessage.getPublisherId()).toEqual(PUBLISHER_ID)
            expect(streamMessage.getMsgChainId()).toEqual('msgChainId')
            expect(streamMessage.prevMsgRef).toBeUndefined()
            expect(streamMessage.messageType).toEqual(StreamMessageType.MESSAGE)
            expect(streamMessage.contentType).toEqual(ContentType.BINARY)
            expect(streamMessage.encryptionType).toEqual(EncryptionType.NONE)
            expect(streamMessage.groupKeyId).toBeUndefined()
            expect(streamMessage.content).toEqualBinary(new Uint8Array([1, 2, 3]))
            expect(streamMessage.newGroupKey).toBeUndefined()
            expect(streamMessage.signature).toEqualBinary(signature)
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
            expect(() =>
                msg({
                    // @ts-expect-error TODO
                    content: utf8ToBinary('encrypted content'),
                    encryptionType: EncryptionType.AES,
                    groupKeyId: 'mock-id'
                })
            ).not.toThrow()
        })

        it('Throws with an no group key for AES encrypted message', () => {
            expect(() =>
                msg({
                    encryptionType: EncryptionType.AES
                } as any)
            ).toThrow(ValidationError)
        })

        describe('prevMsgRef validation', () => {
            it('Throws with identical id + prevMsgRef', () => {
                const ts = Date.now()
                expect(() =>
                    msg({
                        timestamp: ts,
                        sequenceNumber: 0,
                        // @ts-expect-error TODO
                        prevMsgRef: new MessageRef(ts, 0)
                    })
                ).toThrow()
            })
            it('Throws with an invalid ts', () => {
                const ts = Date.now()
                expect(() =>
                    msg({
                        timestamp: ts,
                        sequenceNumber: 0,
                        // @ts-expect-error TODO
                        prevMsgRef: new MessageRef(ts + 1, 0)
                    })
                ).toThrow()
            })

            it('Throws with an invalid sequence', () => {
                const ts = Date.now()
                expect(() =>
                    msg({
                        timestamp: ts,
                        sequenceNumber: 0,
                        // @ts-expect-error TODO
                        prevMsgRef: new MessageRef(ts, 1)
                    })
                ).toThrow()
            })

            it('Throws with an invalid ts + seq', () => {
                const ts = Date.now()
                expect(() =>
                    msg({
                        timestamp: ts,
                        sequenceNumber: 0,
                        // @ts-expect-error TODO
                        prevMsgRef: new MessageRef(ts + 1, 1)
                    })
                ).toThrow()
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
                    prevMsgRef: new MessageRef(1564046332168, 5)
                })
                const copyWithFieldsNullified = new StreamMessage({
                    ...message,
                    encryptionType: EncryptionType.NONE,
                    groupKeyId: undefined,
                    newGroupKey: undefined,
                    prevMsgRef: undefined
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
