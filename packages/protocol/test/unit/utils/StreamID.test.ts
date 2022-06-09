import {
    StreamIDUtils,
    toStreamID
} from '../../../src'
import { KeyExchangeStreamIDUtils } from '../../../src/utils/KeyExchangeStreamID'

const address = '0xaAAAaaaaAA123456789012345678901234567890'

describe('toStreamID', () => {
    it('path-only format', () => {
        const path = '/foo/BAR'
        const actual = toStreamID(path, address)
        expect(actual).toBe('0xaaaaaaaaaa123456789012345678901234567890/foo/BAR')
    })

    it('path-only format with no domain', () => {
        const path = '/foo/BAR'
        return expect(() => {
            toStreamID(path)
        }).toThrowError('path-only format "/foo/BAR" provided without domain')
    })

    it('full stream id format', () => {
        const address = '0xbbbbbBbBbB123456789012345678901234567890'
        const path = '/foo/BAR'
        const id = address + path
        const actual = toStreamID(id)
        expect(actual).toBe(address.toLowerCase() + path)
    })

    it('full stream id format with ENS name', () => {
        const id = 'example.eth/foo/BAR'
        const actual = toStreamID(id)
        expect(actual).toBe(id)
    })

    it('legacy format', () => {
        const id = '7wa7APtlTq6EC5iTCBy6dw'
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

describe('isPathOnlyFormat', () => {
    it('returns true on path-only format', () => {
        expect(StreamIDUtils.isPathOnlyFormat('/foo/bar')).toEqual(true)
    })

    it('returns false on key-exchange format', () => {
        expect(StreamIDUtils.isPathOnlyFormat(toStreamID(KeyExchangeStreamIDUtils.formStreamPartID(address)))).toEqual(false)
    })

    it('returns false on legacy format', () => {
        expect(StreamIDUtils.isPathOnlyFormat('7wa7APtlTq6EC5iTCBy6dw')).toEqual(false)
    })

    it('returns false on full stream id format', () => {
        expect(StreamIDUtils.isPathOnlyFormat(`${address}/foo/bar`)).toEqual(false)
    })

    it('returns false on empty string', () => {
        expect(StreamIDUtils.isPathOnlyFormat('')).toEqual(false)
    })
})

describe('getDomainAndPath', () => {
    it('returns undefined for legacy stream id', () => {
        expect(StreamIDUtils.getDomainAndPath(toStreamID('7wa7APtlTq6EC5iTCBy6dw'))).toBeUndefined()
    })

    it('returns undefined for key-exchange stream id', () => {
        expect(StreamIDUtils.getDomainAndPath(toStreamID(KeyExchangeStreamIDUtils.formStreamPartID(address)))).toBeUndefined()
    })

    it('returns domain and path for full stream id', () => {
        expect(StreamIDUtils.getDomainAndPath(toStreamID('/foo/bar', address)))
            .toEqual([address.toLowerCase(), '/foo/bar'])
    })
})

describe('getDomain', () => {
    it('returns undefined for legacy stream id', () => {
        expect(StreamIDUtils.getDomain(toStreamID('7wa7APtlTq6EC5iTCBy6dw'))).toBeUndefined()
    })

    it('returns undefined for key-exchange stream id', () => {
        expect(StreamIDUtils.getDomain(toStreamID(KeyExchangeStreamIDUtils.formStreamPartID(address)))).toBeUndefined()
    })

    it('returns address for full stream id', () => {
        expect(StreamIDUtils.getDomain(toStreamID('/foo/bar', address))).toEqual(address.toLowerCase())
    })

    it('returns ENS name for full stream id', () => {
        const ensName = 'name.eth'
        expect(StreamIDUtils.getDomain(toStreamID(`${ensName}/foo/bar`))).toEqual(ensName)
    })
})

describe('isENSName', () => {
    it('ENS name', () => {
        expect(StreamIDUtils.isENSName('foobar.eth')).toBe(true)
    })

    it('Ethereum address', () => {
        expect(StreamIDUtils.isENSName('0x1234567890123456789012345678901234567890')).toBe(false)
    })
})

describe('isENSAddress', () => {
    it('ENS name', () => {
        expect(StreamIDUtils.isENSAddress('foobar.eth')).toBe(true)
    })

    it('Ethereum address', () => {
        expect(StreamIDUtils.isENSAddress('0x1234567890123456789012345678901234567890')).toBe(false)
    })
})

describe('getPath', () => {
    it('returns undefined for legacy stream id', () => {
        expect(StreamIDUtils.getPath(toStreamID('7wa7APtlTq6EC5iTCBy6dw'))).toBeUndefined()
    })

    it('returns undefined for key-exchange stream id', () => {
        expect(StreamIDUtils.getPath(toStreamID(KeyExchangeStreamIDUtils.formStreamPartID(address)))).toBeUndefined()
    })

    it('returns path for full stream id', () => {
        expect(StreamIDUtils.getPath(toStreamID('/foo/bar', address))).toEqual('/foo/bar')
    })
})

