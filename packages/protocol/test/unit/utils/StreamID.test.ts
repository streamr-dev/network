import assert from 'assert'
import { toStreamID, Utils } from '../../../src'

const address = '0xaAAAaaaaAA123456789012345678901234567890'

describe('toStreamID', () => {
    it('path-only format', () => {
        const path = '/foo/BAR'
        const actual = toStreamID(path, address)
        expect(actual).toBe('0xaaaaaaaaaa123456789012345678901234567890/foo/BAR')
    })

    it('path-only format with no address', () => {
        const path = '/foo/BAR'
        return expect(() => {
            toStreamID(path)
        }).toThrowError('path-only format "/foo/BAR" provided without address')
    })

    it('full stream id format', () => {
        const address = '0xbbbbbBbBbB123456789012345678901234567890'
        const path = '/foo/BAR'
        const id = address + path
        const actual = toStreamID(id)
        expect(actual).toBe(address.toLowerCase() + path)
    })

    it('full stream id format with ENS domain', () => {
        const id = 'example.eth/foo/BAR'
        const actual = toStreamID(id)
        expect(actual).toBe(id)
    })

    it('legacy format', () => {
        const id = 'abcdeFGHJI1234567890ab'
        const actual = toStreamID(id)
        expect(actual).toBe(id)
    })

    it('key-exchange format', () => {
        const id = 'SYSTEM/keyexchange/0xcccccccccc123456789012345678901234567890'
        const actual = toStreamID(id)
        expect(actual).toBe(id)
    })

    it('empty string throws error', () => {
        return expect(() => {
            toStreamID('')
        }).toThrowError('stream id may not be empty')
    })
})

describe('isKeyExchangeStream', () => {
    it('returns true for streams that start with the correct prefix', () => {
        assert(Utils.isKeyExchangeStream('SYSTEM/keyexchange/0x1234'))
        assert(Utils.isKeyExchangeStream('SYSTEM/keyexchange/foo'))
    })
    it('returns false for other streams', () => {
        assert(!Utils.isKeyExchangeStream('SYSTEM/keyexchangefoo'))
    })
})

describe('getRecipient', () => {
    it('returns recipient in the case of a key-exchange stream', () => {
        const streamId = toStreamID('SYSTEM/keyexchange/0x1234')
        expect(Utils.getRecipient(streamId)).toEqual('0x1234')
    })

    it('returns undefined in the case of a non-key-exchange stream', () => {
        const streamId = toStreamID('/foo/BAR', address)
        expect(Utils.getRecipient(streamId)).toBeUndefined()
    })
})