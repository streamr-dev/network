import { NameDirectory } from '../../src/NameDirectory'

describe('NameDirectory', () => {
    test('known', () => {
        expect(NameDirectory.getName('0xDE33390cC85aBf61d9c27715Fa61d8E5efC61e75')).toBe('T3')
    })
    test('unknown', () => {
        expect(NameDirectory.getName('0x1234567890123456789012345678901234567890')).toBe('0x123456')
    })
})