import { parse }  from '../../../src/utils/TimestampUtil'

describe('TimestampUtil', () => {
    it('parse epoch from number', () => {
        expect(parse(1234567890123)).toBe(1234567890123)
    })

    it('parse epoch from string', () => {
        expect(parse('1234567890123')).toBe(1234567890123)
    })

    it('parse datetime from string', () => {
        expect(parse('2001-02-03T04:05:06Z')).toBe(981173106000)
    })

    it('invalid data', () => {
        expect(() => parse({} as any)).toThrow()
    })
})
