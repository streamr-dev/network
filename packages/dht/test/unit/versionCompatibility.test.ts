import { isCompatibleVersion } from '../../src/helpers/versionCompatibility'

describe('version compatibility', () => {

    it('same minor versions should be compatible', () => {
        expect(isCompatibleVersion('1.2.3', '1.2.4')).toBe(true)
        expect(isCompatibleVersion('100.0.0-pretestnet.0', '100.0.0-pretestnet.40')).toBe(true)
    })

    it('different minor versions should not be compatible', () => {
        expect(isCompatibleVersion('1.2.3', '2.2.4')).toBe(false)
        expect(isCompatibleVersion('1.2.3', '1.3.4')).toBe(false)
        expect(isCompatibleVersion('100.0.0-testnet.0', '101.0.0-pretestnet.40')).toBe(false)
    })

})
