import {
    validateIsDefined,
    validateIsNotEmptyString,
    validateIsNotNegativeInteger,
    validateIsArray,
    validateIsOneOf
} from '../../../src/utils/validations'
import ValidationError from '../../../src/errors/ValidationError'

describe('validations', () => {
    describe('validateIsDefined', () => {
        it('throws ValidationError on undefined', () => {
            expect(() => {
                validateIsDefined('varName', undefined)
            }).toThrow(new ValidationError('Expected varName to not be undefined.'))
        })
    })

    describe('validateIsNotEmptyString', () => {
        it('throws on empty string', () => {
            expect(() => {
                validateIsNotEmptyString('varName', '')
            }).toThrow(new ValidationError('Expected varName to not be an empty string.'))
        })
        it('does not throw on non-empty string', () => {
            expect(() => {
                validateIsNotEmptyString('varName', 'hello, world')
            }).not.toThrow()
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
                validateIsNotNegativeInteger('varName', 10.00)
            }).not.toThrow()
        })
    })

    describe('validateIsArray', () => {
        describe('when allowUndefined = false (default)', () => {
            it('throws ValidationError on undefined', () => {
                expect(() => {
                    validateIsArray('varName', undefined)
                }).toThrow(new ValidationError('Expected varName to not be undefined.'))
            })
        })
        describe('when allowUndefined = true', () => {
            it('does not throw on undefined', () => {
                expect(() => {
                    validateIsArray('varName', undefined, true)
                }).not.toThrow()
            })
        })
        it('throws ValidationError on number', () => {
            expect(() => {
                validateIsArray('varName', 10)
            }).toThrow(new ValidationError('Expected varName to be an array but was a number (10).'))
        })
        it('throws ValidationError on object', () => {
            expect(() => {
                validateIsArray('varName', {
                    hello: 'world',
                })
            }).toThrow(new ValidationError('Expected varName to be an array but was a object ([object Object]).'))
        })
        it('throws ValidationError on string', () => {
            expect(() => {
                validateIsArray('varName', 'string')
            }).toThrow(new ValidationError('Expected varName to be an array but was a string (string).'))
        })
        it('does not throw on empty array', () => {
            expect(() => {
                validateIsArray('varName', [])
            }).not.toThrow()
        })
        it('does not throw on array', () => {
            expect(() => {
                validateIsArray('varName', ['a', 'b', 'c', 'd'])
            }).not.toThrow()
        })
    })

    describe('validateIsOneOf', () => {
        describe('when allowUndefined = false (default)', () => {
            it('throws ValidationError on undefined', () => {
                expect(() => {
                    validateIsOneOf('varName', undefined, [])
                }).toThrow(new ValidationError('Expected varName to not be undefined.'))
            })
        })
        describe('when allowUndefined = true', () => {
            it('does not throw on undefined', () => {
                expect(() => {
                    validateIsOneOf('varName', undefined, [], true)
                }).not.toThrow()
            })
        })
        it('throws ValidationError when value not in list', () => {
            expect(() => {
                validateIsOneOf('varName', 'not-in-list', ['a', 'b', 'c'])
            }).toThrow(new ValidationError('Expected varName to be one of ["a","b","c"] but was (not-in-list).'))
        })
        it('does not throw on included value', () => {
            expect(() => {
                validateIsOneOf('varName', 'b', ['a', 'b', 'c'])
            }).not.toThrow()
        })
    })
})
