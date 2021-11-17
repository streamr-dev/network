import { NameDirectory } from '../../src/NameDirectory'

describe('NameDirectory', () => {
    it('known', () => {
        expect(NameDirectory.getName('0xf2C195bE194a2C91e93Eacb1d6d55a00552a85E2')).toBe('T3')
    })
    it('unknown', () => {
        expect(NameDirectory.getName('0x1234567890123456789012345678901234567890')).toBe('0x123456')
    })
})
