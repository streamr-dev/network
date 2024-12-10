import { StreamrClientError } from '../../src/StreamrClientError'

describe('custom matchers', () => {

    describe('toThrowStreamrClientError', () => {

        it('happy path', () => {
            const error = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
            expect(() => {
                throw error
            }).toThrowStreamrClientError({
                code: error.code,
                message: error.message
            })
        })

        describe('error message', () => {

            it('field', () => {
                const actual = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
                expect(() => {
                    expect(() => { throw actual }).toThrowStreamrClientError({
                        message: 'Foobar',
                        code: 'UNSUPPORTED_OPERATION'
                    })
                }).toThrow('StreamrClientError code values don\'t match')
            })

            it('unexpected class', () => {
                // eslint-disable-next-line @typescript-eslint/no-extraneous-class
                class TestClass {}
                expect(() => {
                    // eslint-disable-next-line @typescript-eslint/only-throw-error
                    expect(() => { throw new TestClass() }).toThrowStreamrClientError({
                        message: 'Foobar',
                        code: 'UNSUPPORTED_OPERATION'
                    })
                }).toThrow('Not an instance of StreamrClientError:\nReceived: "TestClass"')
            })

            it('unexpected primitive', () => {
                expect(() => {
                    // eslint-disable-next-line @typescript-eslint/only-throw-error
                    expect(() => { throw 'mock-error' }).toThrowStreamrClientError({
                        message: 'Foobar',
                        code: 'UNSUPPORTED_OPERATION'
                    })
                }).toThrow('Not an instance of StreamrClientError:\nReceived: "mock-error')
            })

            it('inverse', () => {
                const actual = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
                expect(() => {
                    expect(() => { throw actual }).not.toThrowStreamrClientError(actual)
                }).toThrow('Expected not to throw StreamrClientError')
            })
        })
    })

    describe('toEqualStreamrClientError', () => {

        it('happy path', () => {
            const error = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
            expect(error).toEqualStreamrClientError({
                code: error.code,
                message: error.message
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
