import { expect } from '@jest/globals'
import { printExpected, printReceived } from 'jest-matcher-utils'
import isFunction from 'lodash/isFunction'
import { StreamrClientError, StreamrClientErrorCode } from './../../src/StreamrClientError'

interface ExpectationResult {
    pass: boolean
    message: () => string
}

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

const formError = (description: string, expected: string, actual: string): ExpectationResult => {
    return {
        pass: false,
        message: () => `${description}\nExpected: ${printExpected(expected)}\nReceived: ${printReceived(actual)}`
    }
}

const toThrowStreamrError = (
    actual: unknown, // should be (() => StreamrClientError) | StreamrClientError
    expectedError: PartialStreamrClientError
): ExpectationResult => {
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

    if (!(actualError instanceof StreamrClientError)) {
        return formError('Class name', 'StreamrClientError', (actualError as any).constructor.name)
    }
    if (actualError.code !== expectedError.code) {
        return formError('StreamrClientError.code', expectedError.code, actualError.code)
    }
    if ((expectedError.message !== undefined) && (actualError.message !== expectedError.message)) {
        return formError('StreamrClientError.message', expectedError.message, actualError.message)
    }
    return {
        pass: true,
        message: () => `Expected not to throw ${printReceived('StreamrClientError')}`
    }
}

expect.extend({
    toThrowStreamrError
})
