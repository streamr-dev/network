import assert from 'assert'

import sinon from 'sinon'

import { MessageLayer } from '../../../../src/index'
import ValidationError from '../../../../src/errors/ValidationError'
import UnsupportedVersionError from '../../../../src/errors/UnsupportedVersionError'

const { StreamMessage, MessageRef, MessageIDStrict } = MessageLayer

const content = {
    hello: 'world',
}

const msg = (overrides = {}) => {
    return new StreamMessage({
        messageId: new MessageIDStrict('streamId', 0, 1564046332168, 10, 'publisherId', 'msgChainId'),
        prevMsgRef: new MessageRef(1564046132168, 5),
        content: JSON.stringify(content),
        contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
        encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
        signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
        signature: 'signature',
        ...overrides
    })
}

describe('StreamMessage', () => {
    describe('constructor', () => {
        it('create a StreamMessage with all fields defined', () => {
            const streamMessage = msg()
            assert.strictEqual(streamMessage.getStreamId(), 'streamId')
            assert.strictEqual(streamMessage.getStreamPartition(), 0)
            assert.strictEqual(streamMessage.getTimestamp(), 1564046332168)
            assert.strictEqual(streamMessage.getSequenceNumber(), 10)
            assert.strictEqual(streamMessage.getPublisherId(), 'publisherId')
            assert.strictEqual(streamMessage.getMsgChainId(), 'msgChainId')
            assert.deepStrictEqual(streamMessage.prevMsgRef, new MessageRef(1564046132168, 5))
            assert.strictEqual(streamMessage.contentType, StreamMessage.CONTENT_TYPES.MESSAGE)
            assert.strictEqual(streamMessage.encryptionType, StreamMessage.ENCRYPTION_TYPES.NONE)
            assert.deepStrictEqual(streamMessage.getContent(), content)
            assert.strictEqual(streamMessage.getSerializedContent(), JSON.stringify(content))
            assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
            assert.strictEqual(streamMessage.signature, 'signature')
        })

        it('create StreamMessage with minimum fields defined', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageIDStrict('streamId', 0, 1564046332168, 10, 'publisherId', 'msgChainId'),
                content: JSON.stringify(content),
            })
            assert.strictEqual(streamMessage.getStreamId(), 'streamId')
            assert.strictEqual(streamMessage.getStreamPartition(), 0)
            assert.strictEqual(streamMessage.getTimestamp(), 1564046332168)
            assert.strictEqual(streamMessage.getSequenceNumber(), 10)
            assert.strictEqual(streamMessage.getPublisherId(), 'publisherId')
            assert.strictEqual(streamMessage.getMsgChainId(), 'msgChainId')
            assert.deepStrictEqual(streamMessage.prevMsgRef, null)
            assert.strictEqual(streamMessage.contentType, StreamMessage.CONTENT_TYPES.MESSAGE)
            assert.strictEqual(streamMessage.encryptionType, StreamMessage.ENCRYPTION_TYPES.NONE)
            assert.deepStrictEqual(streamMessage.getContent(), content)
            assert.strictEqual(streamMessage.getSerializedContent(), JSON.stringify(content))
            assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.NONE)
            assert.strictEqual(streamMessage.signature, null)
        })

        it('create StreamMessage with object as content instead of string', () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageIDStrict('streamId', 0, 1564046332168, 10, 'publisherId', 'msgChainId'),
                content,
            })
            assert.deepStrictEqual(streamMessage.getContent(), content)
            assert.strictEqual(streamMessage.getSerializedContent(), JSON.stringify(content))
        })

        it('should throw if required fields are not defined', () => {
            assert.throws(() => new StreamMessage({
                // missing messageId
                content: JSON.stringify(content),
            }), ValidationError)
        })

        it('should throw if content is not defined', () => {
            assert.throws(() => new StreamMessage({
                messageId: new MessageIDStrict('streamId', 0, 1564046332168, 10, 'publisherId', 'msgChainId'),
                // missing content
            }), ValidationError)
        })

        it('should not throw when encrypted content', () => {
            assert.doesNotThrow(() => msg({
                content: 'encrypted content',
                encryptionType: StreamMessage.ENCRYPTION_TYPES.AES,
            }))
        })
        it('Throws with an invalid content type', () => {
            assert.throws(() => msg({
                contentType: 999, // invalid
            }), ValidationError)
        })
        it('Throws with an invalid content of type GROUP_KEY_REQUEST', () => {
            assert.throws(() => msg({
                content: {
                    wrongField: 'some-public-key',
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST,
            }), (err) => {
                assert.strictEqual(err.message, 'Content of type 28 must contain a \'publicKey\' field.')
                return true
            })
        })
        it('Does not throw with a valid content of type GROUP_KEY_REQUEST', () => {
            const m = msg({
                content: {
                    streamId: 'streamId',
                    publicKey: 'some-public-key',
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_REQUEST,
            })
            assert.deepStrictEqual(StreamMessage.deserialize(m.serialize()), m)
        })
        it('Throws with an invalid content of type GROUP_KEY_RESPONSE_SIMPLE (1)', () => {
            assert.throws(() => msg({
                content: {
                    foo: 'bar',
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE,
            }), (err) => {
                assert.strictEqual(err.message, 'Content of type 29 must contain a \'streamId\' field.')
                return true
            })
        })
        it('Throws with an invalid content of type GROUP_KEY_RESPONSE_SIMPLE (2)', () => {
            assert.throws(() => msg({
                content: {
                    streamId: 'streamId',
                    keys: [{
                        groupKey: 'some-group-key',
                        start: 23314,
                    }, {
                        groupKey: 'some-group-key2',
                        wrong: 233142345,
                    }],
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE,
            }), (err) => {
                assert.strictEqual(err.message, 'Each element in field \'keys\' of content of type 29 must contain \'groupKey\' and \'start\' fields.')
                return true
            })
        })
        it('Does not throw with a valid content of type GROUP_KEY_RESPONSE_SIMPLE', () => {
            const m = msg({
                content: {
                    streamId: 'streamId',
                    keys: [{
                        groupKey: 'some-group-key',
                        start: 23314,
                    }, {
                        groupKey: 'some-group-key2',
                        start: 233142345,
                    }],
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_RESPONSE_SIMPLE,
            })
            assert.deepStrictEqual(StreamMessage.deserialize(m.serialize()), m)
        })
        it('Does not throw with a valid content of type GROUP_KEY_RESET_SIMPLE', () => {
            const m = msg({
                content: {
                    streamId: 'streamId',
                    groupKey: 'some-group-key',
                    start: 96789,
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_RESET_SIMPLE,
            })
            assert.deepStrictEqual(StreamMessage.deserialize(m.serialize()), m)
        })
        it('Throws with an invalid content of type GROUP_KEY_RESET_SIMPLE', () => {
            assert.throws(() => msg({
                content: {
                    streamId: 'streamId',
                    groupKey: 'some-group-key2',
                    wrong: 233142345,
                },
                contentType: StreamMessage.CONTENT_TYPES.GROUP_KEY_RESET_SIMPLE,
            }), (err) => {
                assert.strictEqual(err.message, 'Content of type 30 must contain \'streamId\', \'groupKey\' and \'start\' fields.')
                return true
            })
        })
        it('Does not throw with a valid content of type ERROR_MSG', () => {
            const m = msg({
                content: {
                    code: 'some_error_code',
                    message: 'error message',
                },
                contentType: StreamMessage.CONTENT_TYPES.ERROR_MSG,
            })
            assert.deepStrictEqual(StreamMessage.deserialize(m.serialize()), m)
        })
        it('Throws with an invalid content of type ERROR_MSG', () => {
            assert.throws(() => msg({
                content: {
                    wrong: 233142345,
                },
                contentType: StreamMessage.CONTENT_TYPES.ERROR_MSG,
            }), (err) => {
                assert.strictEqual(err.message, 'Content of type 31 must contain \'code\' and \'message\' fields.')
                return true
            })
        })
    })

    describe('serialization', () => {
        let serializer
        const VERSION = 31

        beforeEach(() => {
            serializer = {
                fromArray: sinon.stub(),
                toArray: sinon.stub(),
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
                delete serializer.fromArray
                assert.throws(() => StreamMessage.registerSerializer(VERSION, serializer))
            })
            it('throws if the Serializer does not implement toArray', () => {
                delete serializer.toArray
                assert.throws(() => StreamMessage.registerSerializer(VERSION, serializer))
            })
        })

        describe('serialize', () => {
            const m = msg()

            it('calls toArray() on the configured serializer and stringifies it', () => {
                serializer.toArray = sinon.stub().returns([12345])
                assert.strictEqual(m.serialize(), '[12345]')
                assert(serializer.toArray.calledWith(m))
            })

            it('should throw on unsupported version', () => {
                assert.throws(() => m.serialize(999), (err) => {
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
                serializer.fromArray = sinon.stub().returns(m)
                assert.strictEqual(StreamMessage.deserialize(JSON.stringify(arr)), m)
                assert(serializer.fromArray.calledWith(arr))
            })

            it('should throw on unsupported version', () => {
                const arr = [999]
                assert.throws(() => StreamMessage.deserialize(JSON.stringify(arr)), (err) => {
                    assert(err instanceof UnsupportedVersionError)
                    assert.strictEqual(err.version, 999)
                    return true
                })
            })
        })
    })
})
