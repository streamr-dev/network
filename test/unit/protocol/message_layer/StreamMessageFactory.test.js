import assert from 'assert'
import StreamMessageFactory from '../../../../src/protocol/message_layer/StreamMessageFactory'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageV28 from '../../../../src/protocol/message_layer/StreamMessageV28'
import StreamMessageV29 from '../../../../src/protocol/message_layer/StreamMessageV29'
import StreamMessageV30 from '../../../../src/protocol/message_layer/StreamMessageV30'
import StreamMessageV31 from '../../../../src/protocol/message_layer/StreamMessageV31'
import InvalidJsonError from '../../../../src/errors/InvalidJsonError'
import UnsupportedVersionError from '../../../../src/errors/UnsupportedVersionError'

describe('StreamMessageFactory', () => {
    describe('deserialize', () => {
        it('should throw when unsupported version', () => {
            const arr = [123]
            assert.throws(() => StreamMessageFactory.deserialize(arr), (err) => {
                assert(err instanceof UnsupportedVersionError)
                assert.equal(err.version, 123)
                return true
            })
        })
        it('should create a StreamMessageV28', () => {
            const arr = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}']
            const result = StreamMessageFactory.deserialize(arr)
            assert(result instanceof StreamMessageV28)
        })
        it('throws if the content is invalid', () => {
            const arr = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"invalid\njson"}']
            assert.throws(() => StreamMessageFactory.deserialize(arr), (err) => {
                assert(err instanceof InvalidJsonError)
                assert.equal(err.streamId, 'TsvTbqshTsuLg_HyUjxigA')
                assert.equal(err.jsonString, '{"invalid\njson"}')
                assert(err.streamMessage instanceof StreamMessage)
                return true
            })
        })
        it('should create a StreamMessageV29', () => {
            const arr = [29, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 941516902, 941499898,
                StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'address', 'signature']
            const result = StreamMessageFactory.deserialize(arr)
            assert(result instanceof StreamMessageV29)
        })
        it('should create a StreamMessageV30', () => {
            const arr = [30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 'address', 'msgChainId'], [1529549961000, 0],
                StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'signature']
            const result = StreamMessageFactory.deserialize(arr)
            assert(result instanceof StreamMessageV30)
        })
        it('should create a StreamMessageV29 with parsedContent = false', () => {
            const arr = [29, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 941516902, 941499898,
                StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', StreamMessage.SIGNATURE_TYPES.ETH, 'address', 'signature']
            const result = StreamMessageFactory.deserialize(arr, false)
            assert(result instanceof StreamMessageV29)

            assert.notEqual(result.content, undefined)
            assert.equal(result.parsedContent, undefined)

            assert.deepEqual(result.getParsedContent(), {
                valid: 'json',
            })

            assert.equal(result.content, undefined)
            assert.deepEqual(result.parsedContent, {
                valid: 'json',
            })
        })
        it('should correctly deserialize different versions of StreamMessage with parsedContent = false', () => {
            const json = '[31,["kxeE-gyxS8CkuWYlfBKMVg",0,1567671580680,0,' +
                '"0x8a9b2ca74d8c1c095d34de3f3cdd7462a5c9c9f4b84d11270a0ad885958bb963",' +
                '"7kcxFuyOs4ozeAcVfzJF"],[1567671579675,0],27,0,"{\\"random\\": 0.8314497807870005}",0,null]'
            const PARSE_CONTENT = false
            const streamMessagev31 = StreamMessageFactory.deserialize(json, PARSE_CONTENT)
            assert(streamMessagev31 instanceof StreamMessageV31)

            const streamMessageV30 = StreamMessageFactory.deserialize(streamMessagev31.serialize(30), PARSE_CONTENT)
            assert(streamMessageV30 instanceof StreamMessageV30)
            const streamMessageV29 = StreamMessageFactory.deserialize(streamMessagev31.serialize(29), PARSE_CONTENT)
            assert(streamMessageV29 instanceof StreamMessageV29)
            const streamMessageV28 = StreamMessageFactory.deserialize(streamMessagev31.serialize(28), PARSE_CONTENT)
            assert(streamMessageV28 instanceof StreamMessageV28)
        })
    })
})
