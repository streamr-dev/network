import { printExpected, printReceived } from 'jest-matcher-utils'
import { isFunction, isObject } from 'lodash'
import { StreamrClientError, StreamrClientErrorCode } from './../../src/StreamrClientError'

interface PartialStreamrClientError {
    code: StreamrClientErrorCode
    message?: string
}

// we could ES2015 module syntax (https://jestjs.io/docs/expect#expectextendmatchers),
// but the IDE doesn't find custom matchers if we do that
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace jest {
        interface Matchers<R> {
            toThrowStreamrClientError(expectedError: PartialStreamrClientError): R
            toEqualStreamrClientError(expectedError: PartialStreamrClientError): R
        }
    }
}

const formErrorMessage = (field: keyof StreamrClientError, expected: string, actual: string): string => {
    return `StreamrClientError ${field} values don't match:\nExpected: ${printExpected(expected)}\nReceived: ${printReceived(actual)}`
}

const toThrowStreamrClientError = (
    actual: unknown, // should be (() => StreamrClientError) | StreamrClientError
    expectedError: PartialStreamrClientError
): jest.CustomMatcherResult => {
    let actualError
    if (isFunction(actual)) {
        try {
            actual()
            return {
                pass: false,
                message: () => "Function didn't throw"
            }
        } catch (e) {
            actualError = e
        }
    } else {
        actualError = actual
    }
    const assertionErrors = createAssertionErrors(actualError, expectedError)
    return toCustomMatcherResult(assertionErrors, 'Expected not to throw StreamrClientError')
}

const toEqualStreamrClientError = (
    actual: unknown, // should be StreamrClientError
    expectedError: PartialStreamrClientError
): jest.CustomMatcherResult => {
    const assertionErrors = createAssertionErrors(actual, expectedError)
    return toCustomMatcherResult(assertionErrors, 'StreamrClientErrors are equal')
}

const createAssertionErrors = (actualError: unknown, expectedError: PartialStreamrClientError): string[] => {
    const assertionErrors: string[] = []
    if (!(actualError instanceof StreamrClientError)) {
        const received = isObject(actualError) ? actualError.constructor.name : actualError
        assertionErrors.push(`Not an instance of StreamrClientError:\nReceived: ${printReceived(received)}`)
    } else {
        if (actualError.code !== expectedError.code) {
            assertionErrors.push(formErrorMessage('code', expectedError.code, actualError.code))
        }
        if (expectedError.message !== undefined) {
            // similar matching logic as in https://jestjs.io/docs/expect#tothrowerror
            const isMatch =
                expectedError instanceof Error
                    ? actualError.message === expectedError.message
                    : actualError.message.includes(expectedError.message)
            if (!isMatch) {
                assertionErrors.push(formErrorMessage('message', expectedError.message, actualError.message))
            }
        }
    }
    return assertionErrors
}

const toCustomMatcherResult = (assertionErrors: string[], inversionErrorMessage: string) => {
    if (assertionErrors.length > 0) {
        return {
            pass: false,
            message: () => assertionErrors.join('\n\n')
        }
    } else {
        return {
            pass: true,
            message: () => inversionErrorMessage
        }
    }
}

expect.extend({
    toThrowStreamrClientError,
    toEqualStreamrClientError
})
