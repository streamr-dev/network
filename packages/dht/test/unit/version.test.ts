import { isMaybeSupportedVersion } from '../../src/helpers/version'

describe('version', () => {

    it('supported', () => {
        expect(isMaybeSupportedVersion('1.0')).toBe(true)
        expect(isMaybeSupportedVersion('1.1')).toBe(true)
        expect(isMaybeSupportedVersion('2.0')).toBe(true)
        expect(isMaybeSupportedVersion('3.5')).toBe(true)
    })

    it('not supported', () => {
        expect(isMaybeSupportedVersion('')).toBe(false)
        expect(isMaybeSupportedVersion('100.0.0-testnet-three.3')).toBe(false)
        expect(isMaybeSupportedVersion('0.0')).toBe(false)
        expect(isMaybeSupportedVersion('0.1')).toBe(false)
    })
})