import assert from 'assert'
import StreamMessageFactory from '../../../../src/protocol/message_layer/StreamMessageFactory'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageV28 from '../../../../src/protocol/message_layer/StreamMessageV28'
import StreamMessageV29 from '../../../../src/protocol/message_layer/StreamMessageV29'
import StreamMessageV30 from '../../../../src/protocol/message_layer/StreamMessageV30'
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
    })
})
