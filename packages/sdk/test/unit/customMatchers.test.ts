import { StreamrClientError } from '../../src/StreamrClientError'

const ESCAPED_ANSI_COLOR_REGEXP = '(\\x1B\\[\\d+m)?'

describe('custom matchers', () => {
    describe('toThrowStreamrClientError', () => {
        it('happy path', () => {
            const error = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
            expect(() => {
                throw error
            }).toThrowStreamrClientError(error)
            expect(() => {
                throw error
            }).not.toThrowStreamrClientError(new StreamrClientError('bar', 'UNKNOWN_ERROR'))
            expect(() => {
                throw error
            }).toThrowStreamrClientError({
                code: 'UNKNOWN_ERROR',
                message: 'bar'
            })
            expect(() => {
                throw error
            }).toThrowStreamrClientError({
                code: 'UNKNOWN_ERROR'
            })
        })

        describe('error message', () => {
            it('field', () => {
                const actual = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
                expect(() => {
                    expect(() => {
                        throw actual
                    }).toThrowStreamrClientError({
                        message: 'Foobar',
                        code: 'UNSUPPORTED_OPERATION'
                    })
                }).toThrow("StreamrClientError code values don't match")
            })

            it('unexpected class', () => {
                // eslint-disable-next-line @typescript-eslint/no-extraneous-class
                class TestClass {}
                expect(() => {
                    expect(() => {
                        // eslint-disable-next-line @typescript-eslint/only-throw-error
                        throw new TestClass()
                    }).toThrowStreamrClientError({
                        message: 'Foobar',
                        code: 'UNSUPPORTED_OPERATION'
                    })
                }).toThrow(
                    new RegExp(
                        `Not an instance of StreamrClientError:\nReceived: ${ESCAPED_ANSI_COLOR_REGEXP}"TestClass"${ESCAPED_ANSI_COLOR_REGEXP}`
                    )
                )
            })

            it('unexpected primitive', () => {
                expect(() => {
                    expect(() => {
                        // eslint-disable-next-line @typescript-eslint/only-throw-error
                        throw 'mock-error'
                    }).toThrowStreamrClientError({
                        message: 'Foobar',
                        code: 'UNSUPPORTED_OPERATION'
                    })
                }).toThrow(
                    new RegExp(
                        `Not an instance of StreamrClientError:\nReceived: ${ESCAPED_ANSI_COLOR_REGEXP}"mock-error"${ESCAPED_ANSI_COLOR_REGEXP}`
                    )
                )
            })

            it('inverse', () => {
                const actual = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
                expect(() => {
                    expect(() => {
                        throw actual
                    }).not.toThrowStreamrClientError(actual)
                }).toThrow('Expected not to throw StreamrClientError')
            })
        })
    })

    describe('toEqualStreamrClientError', () => {
        it('happy path', () => {
            const error = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
            expect(error).toEqualStreamrClientError(error)
            expect(error).not.toEqualStreamrClientError(new StreamrClientError('bar', 'UNKNOWN_ERROR'))
            expect(error).toEqualStreamrClientError({
                code: 'UNKNOWN_ERROR',
                message: 'bar'
            })
            expect(error).toEqualStreamrClientError({
                code: 'UNKNOWN_ERROR'
            })
        })

        describe('error message', () => {
            it('inverse', () => {
                const actual = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
                expect(() => {
                    expect(actual).not.toEqualStreamrClientError(actual)
                }).toThrow('StreamrClientErrors are equal')
            })
        })
    })
})
