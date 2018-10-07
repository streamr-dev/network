import assert from 'assert'
import * as Protocol from '../../src/Protocol'
import InvalidJsonError from '../../src/errors/InvalidJsonError'

describe('Protocol', () => {
    describe('decodeMessage', () => {
        it('returns messages untouched if they are not broadcast or unicast messages', () => {
            const msg = {}
            const result = Protocol.decodeMessage('unknown', msg)
            assert(result === msg)
        })

        it('parses message content when the content type is json', () => {
            const msg = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 941516902, 941499898, 27, '{"valid": "json"}']
            const result = Protocol.decodeMessage('b', msg)
            assert.deepEqual(result.content, {
                valid: 'json',
            })
        })

        it('throws if the json is invalid', () => {
            const msg = [28, 'TsvTbqshTsuLg_HyUjxigA', 0, 1529549961116, 0, 941516902, 941499898, 27, '{"invalid\njson"}']
            assert.throws(() => Protocol.decodeMessage('b', msg), (err) => {
                assert(err instanceof InvalidJsonError)
                assert.equal(err.streamId, 'TsvTbqshTsuLg_HyUjxigA')
                assert.equal(err.jsonString, '{"invalid\njson"}')
                assert.equal(err.offset, 941516902)
                assert.equal(err.previousOffset, 941499898)
                return true
            })
        })
    })
})
