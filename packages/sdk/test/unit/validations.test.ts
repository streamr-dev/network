import { ValidationError } from '../../src/protocol/ValidationError'
import { validateIsDefined, validateIsNotNegativeInteger } from '../../src/protocol/validations'

describe('validations', () => {
    describe('validateIsDefined', () => {
        it('throws ValidationError on undefined', () => {
            expect(() => {
                validateIsDefined('varName', undefined)
            }).toThrow(new ValidationError('Expected varName to not be undefined.'))
        })
    })

    describe('validateIsNotNegativeInteger', () => {
        describe('when allowUndefined = false (default)', () => {
            it('throws ValidationError on undefined', () => {
                expect(() => {
                    validateIsNotNegativeInteger('varName', undefined)
                }).toThrow(new ValidationError('Expected varName to not be undefined.'))
            })
        })
        describe('when allowUndefined = true', () => {
            it('does not throw on undefined', () => {
                expect(() => {
                    validateIsNotNegativeInteger('varName', undefined, true)
                }).not.toThrow()
            })
        })
        it('throws ValidationError on NaN', () => {
            expect(() => {
                validateIsNotNegativeInteger('varName', NaN)
            }).toThrow(new ValidationError('Expected varName to be an integer but was a number (NaN).'))
        })
        it('throws ValidationError on infinity', () => {
            expect(() => {
                validateIsNotNegativeInteger('varName', Number.POSITIVE_INFINITY)
            }).toThrow(new ValidationError('Expected varName to be an integer but was a number (Infinity).'))
        })
        it('throws ValidationError on number that is not representable as an integer', () => {
            expect(() => {
                validateIsNotNegativeInteger('varName', 6.66)
            }).toThrow(new ValidationError('Expected varName to be an integer but was a number (6.66).'))
        })
        it('throws on negative integer', () => {
            expect(() => {
                validateIsNotNegativeInteger('varName', -10)
            }).toThrow(new ValidationError('Expected varName to not be negative (-10).'))
        })
        it('does not throw on zero integer', () => {
            expect(() => {
                validateIsNotNegativeInteger('varName', 0)
            }).not.toThrow()
        })
        it('does not throw on positive integer', () => {
            expect(() => {
                validateIsNotNegativeInteger('varName', 10)
            }).not.toThrow()
        })
        it('does not throw on number that is representable as an integer', () => {
            expect(() => {
                validateIsNotNegativeInteger('varName', 10.0)
            }).not.toThrow()
        })
    })
})
