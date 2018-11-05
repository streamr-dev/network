import assert from 'assert'
import StreamMessage from '../../../src/protocol/StreamMessage'
import InvalidJsonError from '../../../src/errors/InvalidJsonError'
import UnsupportedVersionError from '../../../src/errors/UnsupportedVersionError'

describe('StreamMessage', () => {
    describe('version 28', () => {
        describe('deserialize', () => {
            it('correctly parses messages', () => {
                const arr = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']
                const result = StreamMessage.deserialize(arr)

                assert(result instanceof StreamMessage)
                assert.equal(result.streamId, 'TsvTbqshTsuLg_HyUjxigA')
                assert.equal(result.streamPartition, 0)
                assert.equal(result.timestamp, 1529549961116)
                assert.equal(result.ttl, 0)
                assert.equal(result.offset, 941516902)
                assert.equal(result.previousOffset, 941499898)
                assert.equal(result.contentType, StreamMessage.CONTENT_TYPES.JSON)
                assert.equal(result.content, '{"valid": "json"}')
            })

            it('throws if the content is invalid', () => {
                const arr = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"invalid\njson"}']
                assert.throws(() => StreamMessage.deserialize(arr), (err) => {
                    assert(err instanceof InvalidJsonError)
                    assert.equal(err.streamId, 'TsvTbqshTsuLg_HyUjxigA')
                    assert.equal(err.jsonString, '{"invalid\njson"}')
                    assert(err.streamMessage instanceof StreamMessage)
                    return true
                })
            })
        })

        describe('serialize', () => {
            it('correctly serializes messages', () => {
                const arr = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}']

                const serialized = new StreamMessage(
                    'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}',
                ).serialize(28)

                assert.deepEqual(serialized, JSON.stringify(arr))
            })
        })
    })

    describe('unsupported version', () => {
        describe('deserialize', () => {
            it('throws', () => {
                const arr = [123]
                assert.throws(() => StreamMessage.deserialize(arr), (err) => {
                    assert(err instanceof UnsupportedVersionError)
                    assert.equal(err.version, 123)
                    return true
                })
            })
        })

        describe('serialize', () => {
            it('throws', () => {
                assert.throws(() => new StreamMessage(
                    'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                    941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}',
                ).serialize(123), (err) => {
                    assert(err instanceof UnsupportedVersionError)
                    assert.equal(err.version, 123)
                    return true
                })
            })
        })
    })

    describe('getParsedContent()', () => {
        it('returns an object if the constructor was given an object', () => {
            const content = {
                foo: 'bar',
            }
            const msg = new StreamMessage('streamId', 0, Date.now(), 0, 1, null, StreamMessage.CONTENT_TYPES.JSON, content)
            assert.deepEqual(msg.getParsedContent(), content)
        })
        it('returns an object if the constructor was given a string', () => {
            const content = {
                foo: 'bar',
            }
            const msg = new StreamMessage('streamId', 0, Date.now(), 0, 1, null, StreamMessage.CONTENT_TYPES.JSON, JSON.stringify(content))
            assert.deepEqual(msg.getParsedContent(), content)
        })
    })

    describe('toObject()', () => {
        it('parseContent == true', () => {
            const object = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, {
                    valid: 'json',
                }]

            const msg = new StreamMessage(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}',
            )

            assert.deepEqual(msg.toObject(28, true), object)
        })

        it('compact == false', () => {
            const object = {
                streamId: 'TsvTbqshTsuLg_HyUjxigA',
                streamPartition: 0,
                timestamp: 1529549961116,
                ttl: 0,
                offset: 941516902,
                previousOffset: 941499898,
                contentType: StreamMessage.CONTENT_TYPES.JSON,
                content: '{"valid": "json"}',
            }

            const msg = new StreamMessage(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}',
            )

            assert.deepEqual(msg.toObject(28, undefined, false), object)
        })

        it('parseContent == true, compact == false', () => {
            const object = {
                streamId: 'TsvTbqshTsuLg_HyUjxigA',
                streamPartition: 0,
                timestamp: 1529549961116,
                ttl: 0,
                offset: 941516902,
                previousOffset: 941499898,
                contentType: StreamMessage.CONTENT_TYPES.JSON,
                content: {
                    valid: 'json',
                },
            }

            const msg = new StreamMessage(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.JSON, '{"valid": "json"}',
            )

            assert.deepEqual(msg.toObject(28, true, false), object)
        })
    })
})
