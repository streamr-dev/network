import { isSupportedVersion } from '../../src/helpers/versionCompatibility'

describe('version compatibility', () => {

    it('same minor versions should be compatible', () => {
        expect(isSupportedVersion('1.2', ['1.2'])).toBe(true)
        expect(isSupportedVersion('1.2', ['1.0', '1.1', '1.2'])).toBe(true)
    })

    it('different minor versions should not be compatible', () => {
        expect(isSupportedVersion('1.2', ['1.0'])).toBe(false)
        expect(isSupportedVersion('1.2', ['1.0', '1.1', '1.3'])).toBe(false)
        expect(isSupportedVersion('101.0.0-pretestnet.40', ['1.0'])).toBe(false)
    })

})
