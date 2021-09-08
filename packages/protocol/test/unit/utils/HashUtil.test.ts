import { keyToArrayIndex }  from '../../../src/utils/HashUtil'

describe('HashUtil', () => {
    describe('keyToArrayIndex', () => {
        it('always returns 0 if there is only one item', () => {
            expect(keyToArrayIndex(1, 'foo')).toBe(0)
            expect(keyToArrayIndex(1, 'bar')).toBe(0)
            expect(keyToArrayIndex(1, 123456)).toBe(0)
        })
    
        it('selects a deterministic index for string inputs', () => {
            expect(keyToArrayIndex(100, 'foo')).toBe(72)
            expect(keyToArrayIndex(100, 'foo')).toBe(72)
        })
    
        it('selects a deterministic index for number inputs', () => {
            expect(keyToArrayIndex(100, 12345)).toBe(45)
            expect(keyToArrayIndex(100, 12345)).toBe(45)
        })

        it('throws for zero lengthOfArray', () => {
            expect(() => keyToArrayIndex(0, 'foo')).toThrow()
        })

        it('throws for negative lengthOfArray', () => {
            expect(() => keyToArrayIndex(-1, 'foo')).toThrow()
        })
    })
})
