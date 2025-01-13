import { isMaybeSupportedProtocolVersion } from '../../src/helpers/version'

describe('version', () => {
    it('supported', () => {
        expect(isMaybeSupportedProtocolVersion('1.0')).toBe(true)
        expect(isMaybeSupportedProtocolVersion('1.1')).toBe(true)
        expect(isMaybeSupportedProtocolVersion('2.0')).toBe(true)
        expect(isMaybeSupportedProtocolVersion('3.5')).toBe(true)
    })

    it('not supported', () => {
        expect(isMaybeSupportedProtocolVersion('')).toBe(false)
        expect(isMaybeSupportedProtocolVersion('100.0.0-testnet-three.3')).toBe(false)
        expect(isMaybeSupportedProtocolVersion('0.0')).toBe(false)
        expect(isMaybeSupportedProtocolVersion('0.1')).toBe(false)
    })
})
