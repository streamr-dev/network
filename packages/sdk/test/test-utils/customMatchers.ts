import { printExpected, printReceived } from 'jest-matcher-utils'
import isFunction from 'lodash/isFunction'
import { StreamrClientError, StreamrClientErrorCode } from './../../src/StreamrClientError'
import { areEqualBinaries, binaryToHex } from '@streamr/utils'

interface PartialStreamrClientError {
    code: StreamrClientErrorCode
    message?: string
}

interface CustomMatchers<R = unknown> {
    toThrowStreamrError(expectedError: PartialStreamrClientError): R
    toEqualBinary(expected: Uint8Array): R
}

// we could ES2015 module syntax (https://jestjs.io/docs/expect#expectextendmatchers),
// but the IDE doesn't find custom matchers if we do that
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace jest {
        interface Expect extends CustomMatchers {}
        interface Matchers<R> extends CustomMatchers<R> {}
    }
}

const formErrorMessage = (description: string, expected: string, actual: string): string => {
    return `${description}\nExpected: ${printExpected(expected)}\nReceived: ${printReceived(actual)}`
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
        messages.push(formErrorMessage('Class name', 'StreamrClientError', actualError.constructor.name))
    } else {
        if (actualError.code !== expectedError.code) {
            messages.push(formErrorMessage('StreamrClientError.code', expectedError.code, actualError.code))
        }
        if ((expectedError.message !== undefined) && (actualError.message !== expectedError.message)) {
            messages.push(formErrorMessage('StreamrClientError.message', expectedError.message, actualError.message))
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
            message: () => `Expected not to throw ${printReceived('StreamrClientError')}`
        }
    }
}

const toEqualBinary = (
    actual: unknown,
    expected: Uint8Array
): jest.CustomMatcherResult => {
    if (!(actual instanceof Uint8Array)) {
        return {
            pass: false,
            message: () => 'Expected an instance of Uint8Array'
        }
    }
    const areEqual = areEqualBinaries(actual, expected)
    return {
        pass: areEqual,
        message: () => {
            if (!areEqual) {
                return formErrorMessage('Binaries are not equal', binaryToHex(expected, true), binaryToHex(actual, true))
            } else {
                return `Binaries are equal\nReceived:${printReceived(binaryToHex(actual, true))}`
            }
        }
    }
}

expect.extend({
    toThrowStreamrError,
    toEqualBinary
})
