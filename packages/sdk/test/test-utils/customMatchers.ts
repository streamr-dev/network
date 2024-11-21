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
            toThrowStreamrError(expectedError: PartialStreamrClientError): R
        }
    }
}

const formErrorMessage = (field: keyof StreamrClientError, expected: string, actual: string): string => {
    return `StreamrClientError ${field} values don't match:\nExpected: ${printExpected(expected)}\nReceived: ${printReceived(actual)}`
}

const toThrowStreamrError = (
    actual: unknown, // should be (() => StreamrClientError) | StreamrClientError
    expectedError: PartialStreamrClientError
): jest.CustomMatcherResult => {
    let actualError
    if (isFunction(actual)) {
        try {
            actual()
            return {
                pass: false,
                message: () => 'Function didn\'t throw'
            }
        } catch (e) {
            actualError = e
        }
    } else {
        actualError = actual
    }

    const messages: string[] = []
    if (!(actualError instanceof StreamrClientError)) {
        const received = isObject(actualError) ? actualError.constructor.name : actualError
        messages.push(`Not an instance of StreamrClientError:\nReceived: ${printReceived(received)}`)
    } else {
        if (actualError.code !== expectedError.code) {
            messages.push(formErrorMessage('code', expectedError.code, actualError.code))
        }
        if ((expectedError.message !== undefined) && (actualError.message !== expectedError.message)) {
            messages.push(formErrorMessage('message', expectedError.message, actualError.message))
        }
    }
    if (messages.length > 0) {
        return {
            pass: false,
            message: () => messages.join('\n\n')
        }
    } else {
        return {
            pass: true,
            message: () => `Expected not to throw StreamrClientError}`
        }
    }
}

expect.extend({
    toThrowStreamrError
})
