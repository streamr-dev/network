import { StreamrClientError } from '../../src/StreamrClientError'

describe('custom matchers', () => {

    describe('toThrowStreamrError', () => {

        it('happy path', () => {
            const error = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
            expect(() => {
                throw error
            }).toThrowStreamrError({
                code: error.code,
                message: error.message
            })
        })

        describe('error message', () => {

            it('field', () => {
                const actual = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
                expect(() => {
                    expect(() => { throw actual }).toThrowStreamrError({
                        message: 'Foobar',
                        code: 'UNSUPPORTED_OPERATION'
                    })
                }).toThrow('StreamrClientError code values don\'t match')
            })

            it('unexpected class', () => {
                class TestClass {}
                expect(() => {
                    expect(() => { throw new TestClass() }).toThrowStreamrError({
                        message: 'Foobar',
                        code: 'UNSUPPORTED_OPERATION'
                    })
                }).toThrow('Not an instance of StreamrClientError:\nReceived: "TestClass"')
            })

            it('unexpected privitive', () => {
                expect(() => {
                    expect(() => { throw 'mock-error' }).toThrowStreamrError({
                        message: 'Foobar',
                        code: 'UNSUPPORTED_OPERATION'
                    })
                }).toThrow('Not an instance of StreamrClientError:\nReceived: "mock-error')
            })

            it('inverse', () => {
                const actual = new StreamrClientError('Foobar', 'UNKNOWN_ERROR')
                expect(() => {
                    expect(() => { throw actual }).not.toThrowStreamrError(actual)
                }).toThrow('Expected not to throw StreamrClientError')
            })
        })
    })
})
