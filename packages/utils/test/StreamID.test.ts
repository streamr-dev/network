import { toEthereumAddress } from '../src/EthereumAddress'
import { StreamIDUtils, toStreamID } from '../src/StreamID'

const address = '0xaAAAaaaaAA123456789012345678901234567890'

describe('toStreamID', () => {
    it('path-only format', () => {
        const path = '/foo/BAR'
        const actual = toStreamID(path, toEthereumAddress(address))
        expect(actual).toBe('0xaaaaaaaaaa123456789012345678901234567890/foo/BAR')
    })

    it('path-only format with no domain', () => {
        const path = '/foo/BAR'
        expect(() => {
            toStreamID(path)
        }).toThrow('path-only format "/foo/BAR" provided without domain')
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

    it('empty string throws error', () => {
        expect(() => {
            toStreamID('')
        }).toThrow('stream id may not be empty')
    })
})

describe('isPathOnlyFormat', () => {
    it('returns true on path-only format', () => {
        expect(StreamIDUtils.isPathOnlyFormat('/foo/bar')).toEqual(true)
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

    it('returns domain and path for full stream id', () => {
        expect(StreamIDUtils.getDomainAndPath(toStreamID('/foo/bar', toEthereumAddress(address)))).toEqual([
            address.toLowerCase(),
            '/foo/bar'
        ])
    })
})

describe('getDomain', () => {
    it('returns undefined for legacy stream id', () => {
        expect(StreamIDUtils.getDomain(toStreamID('7wa7APtlTq6EC5iTCBy6dw'))).toBeUndefined()
    })

    it('returns address for full stream id', () => {
        const streamId = toStreamID('/foo/bar', toEthereumAddress(address))
        expect(StreamIDUtils.getDomain(streamId)).toEqual(address.toLowerCase())
    })

    it('returns ENS name for full stream id', () => {
        const ensName = 'name.eth'
        expect(StreamIDUtils.getDomain(toStreamID(`${ensName}/foo/bar`))).toEqual(ensName)
    })
})

describe('getPath', () => {
    it('returns undefined for legacy stream id', () => {
        expect(StreamIDUtils.getPath(toStreamID('7wa7APtlTq6EC5iTCBy6dw'))).toBeUndefined()
    })

    it('returns path for full stream id', () => {
        expect(StreamIDUtils.getPath(toStreamID('/foo/bar', toEthereumAddress(address)))).toEqual('/foo/bar')
    })
})
