import {
    validateIsNotNullOrUndefined,
    validateIsString,
    validateIsNotEmptyString,
    validateIsInteger,
    validateIsNotNegativeInteger,
} from '../../../src/utils/validations'
import ValidationError from '../../../src/errors/ValidationError'

describe('validations', () => {
    describe('validateIsNotNullOrUndefined', () => {
        it('throws ValidationError on undefined', () => {
            expect(() => {
                validateIsNotNullOrUndefined('varName', undefined)
            }).toThrow(new ValidationError('Expected varName to not be undefined.'))
        })
        it('throws ValidationError on null', () => {
            expect(() => {
                validateIsNotNullOrUndefined('varName', null)
            }).toThrow(new ValidationError('Expected varName to not be null.'))
        })
    })

    describe('validateIsString', () => {
        describe('when allowNull = false (default)', () => {
            it('throws ValidationError on undefined', () => {
                expect(() => {
                    validateIsString('varName', undefined)
                }).toThrow(new ValidationError('Expected varName to not be undefined.'))
            })
            it('throws ValidationError on null', () => {
                expect(() => {
                    validateIsString('varName', null)
                }).toThrow(new ValidationError('Expected varName to not be null.'))
            })
        })
        describe('when allowNull = true', () => {
            it('does not throw on undefined', () => {
                expect(() => {
                    validateIsString('varName', undefined, true)
                }).not.toThrow()
            })
            it('does not throw on null', () => {
                expect(() => {
                    validateIsString('varName', null, true)
                }).not.toThrow()
            })
        })
        it('throws ValidationError on number', () => {
            expect(() => {
                validateIsString('varName', 10)
            }).toThrow(new ValidationError('Expected varName to be a string but was a number (10).'))
        })
        it('throws ValidationError on object', () => {
            expect(() => {
                validateIsString('varName', {
                    hello: 'world',
                })
            }).toThrow(new ValidationError('Expected varName to be a string but was a object ([object Object]).'))
        })
        it('does not throw on empty string', () => {
            expect(() => {
                validateIsString('varName', '')
            }).not.toThrow()
        })
        it('does not throw on non-empty string', () => {
            expect(() => {
                validateIsString('varName', 'hello, world')
            }).not.toThrow()
        })
    })

    describe('validateIsNotEmptyString', () => {
        describe('when allowNull = false (default)', () => {
            it('throws ValidationError on undefined', () => {
                expect(() => {
                    validateIsNotEmptyString('varName', undefined)
                }).toThrow(new ValidationError('Expected varName to not be undefined.'))
            })
            it('throws ValidationError on null', () => {
                expect(() => {
                    validateIsNotEmptyString('varName', null)
                }).toThrow(new ValidationError('Expected varName to not be null.'))
            })
        })
        describe('when allowNull = true', () => {
            it('does not throw on undefined', () => {
                expect(() => {
                    validateIsNotEmptyString('varName', undefined, true)
                }).not.toThrow()
            })
            it('does not throw on null', () => {
                expect(() => {
                    validateIsNotEmptyString('varName', null, true)
                }).not.toThrow()
            })
        })
        it('throws ValidationError on number', () => {
            expect(() => {
                validateIsNotEmptyString('varName', 10)
            }).toThrow(new ValidationError('Expected varName to be a string but was a number (10).'))
        })
        it('throws ValidationError on object', () => {
            expect(() => {
                validateIsNotEmptyString('varName', {
                    hello: 'world',
                })
            }).toThrow(new ValidationError('Expected varName to be a string but was a object ([object Object]).'))
        })
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

    describe('validateIsInteger', () => {
        describe('when allowNull = false (default)', () => {
            it('throws ValidationError on undefined', () => {
                expect(() => {
                    validateIsInteger('varName', undefined)
                }).toThrow(new ValidationError('Expected varName to not be undefined.'))
            })
            it('throws ValidationError on null', () => {
                expect(() => {
                    validateIsInteger('varName', null)
                }).toThrow(new ValidationError('Expected varName to not be null.'))
            })
        })
        describe('when allowNull = true', () => {
            it('does not throw on undefined', () => {
                expect(() => {
                    validateIsInteger('varName', undefined, true)
                }).not.toThrow()
            })
            it('does not throw on null', () => {
                expect(() => {
                    validateIsInteger('varName', null, true)
                }).not.toThrow()
            })
        })
        it('throws ValidationError on string', () => {
            expect(() => {
                validateIsInteger('varName', 'string')
            }).toThrow(new ValidationError('Expected varName to be an integer but was a string (string).'))
        })
        it('throws ValidationError on object', () => {
            expect(() => {
                validateIsInteger('varName', {
                    hello: 'world',
                })
            }).toThrow(new ValidationError('Expected varName to be an integer but was a object ([object Object]).'))
        })
        it('throws ValidationError on NaN', () => {
            expect(() => {
                validateIsInteger('varName', NaN)
            }).toThrow(new ValidationError('Expected varName to be an integer but was a number (NaN).'))
        })
        it('throws ValidationError on infinity', () => {
            expect(() => {
                validateIsInteger('varName', Number.POSITIVE_INFINITY)
            }).toThrow(new ValidationError('Expected varName to be an integer but was a number (Infinity).'))
        })
        it('throws ValidationError on number that is not representable as an integer', () => {
            expect(() => {
                validateIsInteger('varName', 6.66)
            }).toThrow(new ValidationError('Expected varName to be an integer but was a number (6.66).'))
        })
        it('does not throw on negative integer', () => {
            expect(() => {
                validateIsInteger('varName', -10)
            }).not.toThrow()
        })
        it('does not throw on zero integer', () => {
            expect(() => {
                validateIsInteger('varName', 0)
            }).not.toThrow()
        })
        it('does not throw on positive integer', () => {
            expect(() => {
                validateIsInteger('varName', 10)
            }).not.toThrow()
        })
        it('does not throw on number that is representable as an integer', () => {
            expect(() => {
                validateIsInteger('varName', 10.00)
            }).not.toThrow()
        })
    })

    describe('validateIsNotNegativeInteger', () => {
        describe('when allowNull = false (default)', () => {
            it('throws ValidationError on undefined', () => {
                expect(() => {
                    validateIsNotNegativeInteger('varName', undefined)
                }).toThrow(new ValidationError('Expected varName to not be undefined.'))
            })
            it('throws ValidationError on null', () => {
                expect(() => {
                    validateIsNotNegativeInteger('varName', null)
                }).toThrow(new ValidationError('Expected varName to not be null.'))
            })
        })
        describe('when allowNull = true', () => {
            it('does not throw on undefined', () => {
                expect(() => {
                    validateIsNotNegativeInteger('varName', undefined, true)
                }).not.toThrow()
            })
            it('does not throw on null', () => {
                expect(() => {
                    validateIsNotNegativeInteger('varName', null, true)
                }).not.toThrow()
            })
        })
        it('throws ValidationError on string', () => {
            expect(() => {
                validateIsNotNegativeInteger('varName', 'string')
            }).toThrow(new ValidationError('Expected varName to be an integer but was a string (string).'))
        })
        it('throws ValidationError on object', () => {
            expect(() => {
                validateIsNotNegativeInteger('varName', {
                    hello: 'world',
                })
            }).toThrow(new ValidationError('Expected varName to be an integer but was a object ([object Object]).'))
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
})
