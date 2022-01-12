import assert from 'assert'
import {
    StreamIDUtils
} from '../../../src'

const address = '0xaAAAaaaaAA123456789012345678901234567890'

describe('formKeyExchangeStreamID', () => {
    it('forms key-exchange stream ids', () => {
        expect(StreamIDUtils.formKeyExchangeStreamID('0xFaFa1234')).toEqual(StreamIDUtils.KEY_EXCHANGE_STREAM_PREFIX + '0xfafa1234')
    })
})

describe('toStreamID', () => {
    it('path-only format', () => {
        const path = '/foo/BAR'
        const actual = StreamIDUtils.toStreamID(path, address)
        expect(actual).toBe('0xaaaaaaaaaa123456789012345678901234567890/foo/BAR')
    })

    it('path-only format with no address', () => {
        const path = '/foo/BAR'
        return expect(() => {
            StreamIDUtils.toStreamID(path)
        }).toThrowError('path-only format "/foo/BAR" provided without address')
    })

    it('full stream id format', () => {
        const address = '0xbbbbbBbBbB123456789012345678901234567890'
        const path = '/foo/BAR'
        const id = address + path
        const actual = StreamIDUtils.toStreamID(id)
        expect(actual).toBe(address.toLowerCase() + path)
    })

    it('full stream id format with ENS domain', () => {
        const id = 'example.eth/foo/BAR'
        const actual = StreamIDUtils.toStreamID(id)
        expect(actual).toBe(id)
    })

    it('legacy format', () => {
        const id = '7wa7APtlTq6EC5iTCBy6dw'
        const actual = StreamIDUtils.toStreamID(id)
        expect(actual).toBe(id)
    })

    it('key-exchange format', () => {
        const id = 'SYSTEM/keyexchange/0xcccccccccc123456789012345678901234567890'
        const actual = StreamIDUtils.toStreamID(id)
        expect(actual).toBe(id)
    })

    it('empty string throws error', () => {
        return expect(() => {
            StreamIDUtils.toStreamID('')
        }).toThrowError('stream id may not be empty')
    })
})

describe('isPathOnlyFormat', () => {
    it('returns true on path-only format', () => {
        expect(StreamIDUtils.isPathOnlyFormat('/foo/bar')).toEqual(true)
    })

    it('returns false on key-exchange format', () => {
        expect(StreamIDUtils.isPathOnlyFormat(StreamIDUtils.formKeyExchangeStreamID(address))).toEqual(false)
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

describe('isKeyExchangeStream', () => {
    it('returns true for streams that start with the correct prefix', () => {
        assert(StreamIDUtils.isKeyExchangeStream('SYSTEM/keyexchange/0x1234'))
        assert(StreamIDUtils.isKeyExchangeStream('SYSTEM/keyexchange/foo'))
    })
    it('returns false for other streams', () => {
        assert(!StreamIDUtils.isKeyExchangeStream('SYSTEM/keyexchangefoo'))
    })
})

describe('getAddressAndPathFromStreamID', () => {
    it('returns undefined for legacy stream id', () => {
        expect(StreamIDUtils.getAddressAndPathFromStreamID(StreamIDUtils.toStreamID('7wa7APtlTq6EC5iTCBy6dw'))).toBeUndefined()
    })

    it('returns undefined for key-exchange stream id', () => {
        expect(StreamIDUtils.getAddressAndPathFromStreamID(StreamIDUtils.formKeyExchangeStreamID(address))).toBeUndefined()
    })

    it('returns address and path for full stream id', () => {
        expect(StreamIDUtils.getAddressAndPathFromStreamID(StreamIDUtils.toStreamID('/foo/bar', address)))
            .toEqual([address.toLowerCase(), '/foo/bar'])
    })
})

describe('getAddressFromStreamID', () => {
    it('returns undefined for legacy stream id', () => {
        expect(StreamIDUtils.getAddressFromStreamID(StreamIDUtils.toStreamID('7wa7APtlTq6EC5iTCBy6dw'))).toBeUndefined()
    })

    it('returns undefined for key-exchange stream id', () => {
        expect(StreamIDUtils.getAddressFromStreamID(StreamIDUtils.formKeyExchangeStreamID(address))).toBeUndefined()
    })

    it('returns address for full stream id', () => {
        expect(StreamIDUtils.getAddressFromStreamID(StreamIDUtils.toStreamID('/foo/bar', address))).toEqual(address.toLowerCase())
    })
})

describe('getPathFromStreamID', () => {
    it('returns undefined for legacy stream id', () => {
        expect(StreamIDUtils.getPathFromStreamID(StreamIDUtils.toStreamID('7wa7APtlTq6EC5iTCBy6dw'))).toBeUndefined()
    })

    it('returns undefined for key-exchange stream id', () => {
        expect(StreamIDUtils.getPathFromStreamID(StreamIDUtils.formKeyExchangeStreamID(address))).toBeUndefined()
    })

    it('returns path for full stream id', () => {
        expect(StreamIDUtils.getPathFromStreamID(StreamIDUtils.toStreamID('/foo/bar', address))).toEqual('/foo/bar')
    })
})

describe('getRecipient', () => {
    it('returns recipient in the case of a key-exchange stream', () => {
        const streamId = StreamIDUtils.toStreamID('SYSTEM/keyexchange/0x1234')
        expect(StreamIDUtils.getRecipient(streamId)).toEqual('0x1234')
    })

    it('returns undefined in the case of a non-key-exchange stream', () => {
        const streamId = StreamIDUtils.toStreamID('/foo/BAR', address)
        expect(StreamIDUtils.getRecipient(streamId)).toBeUndefined()
    })
})