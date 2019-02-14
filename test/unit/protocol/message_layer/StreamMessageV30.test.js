import assert from 'assert'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageV30 from '../../../../src/protocol/message_layer/StreamMessageV30'

describe('StreamMessageV30', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = [['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
            const result = new StreamMessageV30(...arr)

            assert(result instanceof StreamMessageV30)
            assert.equal(result.getStreamId(), 'TsvTbqshTsuLg_HyUjxigA')
            assert.equal(result.getStreamPartition(), 0)
            assert.equal(result.getTimestamp(), 1529549961116)
            assert.equal(result.messageId.sequenceNumber, 0)
            assert.equal(result.getPublisherId(), 'publisherId')
            assert.equal(result.messageId.msgChainId, 'msg-chain-id')
            assert.equal(result.prevMsgRef.timestamp, 1529549961000)
            assert.equal(result.prevMsgRef.sequenceNumber, 0)
            assert.equal(result.contentType, StreamMessage.CONTENT_TYPES.JSON)
            assert.equal(result.getContent(), '{"valid": "json"}')
            assert.equal(result.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
            assert.equal(result.signature, 'signature')
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const content = {
                foo: 'bar',
            }
            const arr = [30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, JSON.stringify(content), StreamMessage.SIGNATURE_TYPES.ETH, 'signature']

            const serialized = new StreamMessageV30(
                ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, content, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            ).serialize()

            assert.deepEqual(serialized, JSON.stringify(arr))
        })
        it('correctly serializes messages without stringify', () => {
            const content = {
                foo: 'bar',
            }
            const arr = [30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, JSON.stringify(content), StreamMessage.SIGNATURE_TYPES.ETH, 'signature']

            const serialized = new StreamMessageV30(
                ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, content, StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            ).serialize(30, {
                stringify: false,
            })

            assert.deepEqual(serialized, arr)
        })
        it('correctly serializes messages with no signature', () => {
            const content = {
                foo: 'bar',
            }
            const arr = [30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, JSON.stringify(content), StreamMessage.SIGNATURE_TYPES.NONE, null]

            const serialized = new StreamMessageV30(
                ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, content, StreamMessage.SIGNATURE_TYPES.NONE,
            ).serialize()

            assert.deepEqual(serialized, JSON.stringify(arr))
        })
        it('correctly serializes messages with no previous ref', () => {
            const content = {
                foo: 'bar',
            }
            const arr = [30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                null, StreamMessage.CONTENT_TYPES.JSON, JSON.stringify(content), StreamMessage.SIGNATURE_TYPES.NONE, null]

            const serialized = new StreamMessageV30(
                ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                null, StreamMessage.CONTENT_TYPES.JSON, content, StreamMessage.SIGNATURE_TYPES.NONE,
            ).serialize()

            assert.deepEqual(serialized, JSON.stringify(arr))
        })
        it('correctly serializes messages to v29', () => {
            const arr = [29, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 1529549961116, 1529549961000,
                StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'publisherId', 'signature']

            const serialized = new StreamMessageV30(
                ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            ).serialize(29)

            assert.deepEqual(serialized, JSON.stringify(arr))
        })
        it('correctly serializes messages to v28', () => {
            const arr = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                1529549961116, 1529549961000, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']

            const serialized = new StreamMessageV30(
                ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'address', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            ).serialize(28)

            assert.deepEqual(serialized, JSON.stringify(arr))
        })
    })

    describe('getParsedContent()', () => {
        it('returns an object if the constructor was given an object', () => {
            const content = {
                foo: 'bar',
            }
            const msg = new StreamMessageV30(
                ['streamId', 0, Date.now(), 0, 'publisherId', 1], [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, content,
                StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            assert.deepEqual(msg.getParsedContent(), content)
        })
        it('returns an object if the constructor was given a string', () => {
            const content = {
                foo: 'bar',
            }
            const msg = new StreamMessageV30(
                ['streamId', 0, Date.now(), 0, 'publisherId', 1], [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, JSON.stringify(content),
                StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )
            assert.deepEqual(msg.getParsedContent(), content)
        })
    })

    describe('toArray()', () => {
        it('parsedContent == true', () => {
            const array = [30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, {
                    valid: 'json',
                }, StreamMessage.SIGNATURE_TYPES.ETH, 'signature']

            const msg = new StreamMessageV30(
                ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'], [1529549961000, 0],
                StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )

            assert.deepEqual(msg.toArray(true), array)
        })

        it('parsedContent == false', () => {
            const array = [30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'],
                [1529549961000, 0], StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']

            const msg = new StreamMessageV30(
                ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'publisherId', 'msg-chain-id'], [1529549961000, 0],
                StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature',
            )

            assert.deepEqual(msg.toArray(), array)
        })
    })
})
