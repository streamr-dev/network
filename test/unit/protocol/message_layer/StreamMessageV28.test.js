import assert from 'assert'
import StreamMessage from '../../../../src/protocol/message_layer/StreamMessage'
import StreamMessageV28 from '../../../../src/protocol/message_layer/StreamMessageV28'

describe('StreamMessageV28', () => {
    describe('deserialize', () => {
        it('correctly parses messages', () => {
            const arr = ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}']
            const result = new StreamMessageV28(...arr)

            assert(result instanceof StreamMessage)
            assert.equal(result.getStreamId(), 'TsvTbqshTsuLg_HyUjxigA')
            assert.equal(result.getStreamPartition(), 0)
            assert.equal(result.getTimestamp(), 1529549961116)
            assert.equal(result.ttl, 0)
            assert.equal(result.offset, 941516902)
            assert.equal(result.previousOffset, 941499898)
            assert.equal(result.contentType, StreamMessage.CONTENT_TYPES.MESSAGE)
            assert.equal(result.getContent(), '{"valid": "json"}')
            assert.equal(result.getPublisherId(), undefined)
        })
    })

    describe('serialize', () => {
        it('correctly serializes messages', () => {
            const arr = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}']

            const serialized = new StreamMessageV28(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}',
            ).serialize()

            assert.deepEqual(serialized, JSON.stringify(arr))
        })
        it('correctly serializes messages without stringify', () => {
            const arr = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}']

            const serialized = new StreamMessageV28(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}',
            ).serialize(28, {
                stringify: false,
            })

            assert.deepEqual(serialized, arr)
        })
        it('correctly serializes messages to v29', () => {
            const arr = [29, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', 0, null, null]

            const serialized = new StreamMessageV28(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}',
            ).serialize(29)

            assert.deepEqual(serialized, JSON.stringify(arr))
        })
        it('correctly serializes messages to v30', () => {
            const arr = [30, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, '', ''],
                [null, null], StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}', 0, null]

            const serialized = new StreamMessageV28(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}',
            ).serialize(30)

            assert.deepEqual(serialized, JSON.stringify(arr))
        })
        it('correctly serializes messages to v31', () => {
            const arr = [31, ['TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, '', ''],
                [null, null], StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, '{"valid": "json"}', 0, null]

            const serialized = new StreamMessageV28(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}',
            ).serialize(31)

            assert.deepEqual(serialized, JSON.stringify(arr))
        })
    })

    describe('getParsedContent()', () => {
        it('returns an object if the constructor was given an object', () => {
            const content = {
                foo: 'bar',
            }
            const msg = new StreamMessageV28('streamId', 0, Date.now(), 0, 1, null, StreamMessage.CONTENT_TYPES.MESSAGE, content)
            assert.deepEqual(msg.getParsedContent(), content)
        })
        it('returns an object if the constructor was given a string', () => {
            const content = {
                foo: 'bar',
            }
            const msg = new StreamMessageV28('streamId', 0, Date.now(), 0, 1, null, StreamMessage.CONTENT_TYPES.MESSAGE, JSON.stringify(content))
            assert.deepEqual(msg.getParsedContent(), content)
        })
    })

    describe('toObject()', () => {
        it('parseContent == true', () => {
            const object = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, {
                    valid: 'json',
                }]

            const msg = new StreamMessageV28(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}',
            )

            assert.deepEqual(msg.toObject(true), object)
        })

        it('compact == false', () => {
            const object = {
                streamId: 'TsvTbqshTsuLg_HyUjxigA',
                streamPartition: 0,
                timestamp: 1529549961116,
                ttl: 0,
                offset: 941516902,
                previousOffset: 941499898,
                contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                content: '{"valid": "json"}',
            }

            const msg = new StreamMessageV28(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}',
            )

            assert.deepEqual(msg.toObject(undefined, false), object)
        })

        it('parseContent == true, compact == false', () => {
            const object = {
                streamId: 'TsvTbqshTsuLg_HyUjxigA',
                streamPartition: 0,
                timestamp: 1529549961116,
                ttl: 0,
                offset: 941516902,
                previousOffset: 941499898,
                contentType: StreamMessage.CONTENT_TYPES.MESSAGE,
                content: {
                    valid: 'json',
                },
            }

            const msg = new StreamMessageV28(
                'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0,
                941516902, 941499898, StreamMessage.CONTENT_TYPES.MESSAGE, '{"valid": "json"}',
            )

            assert.deepEqual(msg.toObject(true, false), object)
        })
    })
})
