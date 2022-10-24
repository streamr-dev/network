import { expect } from '@jest/globals'
import type { MatcherState } from 'expect'
import { printExpected, printReceived } from 'jest-matcher-utils'
import { StreamrClientError } from './../../src/StreamrClientError'

// we could ES2015 module syntax (https://jestjs.io/docs/expect#expectextendmatchers),
// but the IDE doesn't find custom matchers if we do that
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace jest {
        interface Matchers<R> {
            toThrowStreamError(expectedError: Partial<StreamrClientError>): R
        }
    }
}

const formError = (description: string, expected: string, actual: string) => {
    return {
        pass: false,
        message: () => `${description}\nExpected: ${printExpected(expected)}\nReceived: ${printReceived(actual)}`
    }
}

const toThrowStreamError = function(
    this: MatcherState,
    actualError: unknown,
    expectedError: Partial<StreamrClientError>
) {
    if (!(actualError instanceof StreamrClientError)) {
        return formError('Class name', 'StreamrClientError', (actualError as any).constructor.name)
    }
    if ((expectedError.code !== undefined) && (actualError.code !== expectedError.code)) {
        return formError('StreamrClientError.code', expectedError.code, actualError.code)
    }
    if ((expectedError.message !== undefined) && (actualError.message !== expectedError.message)) {
        return formError('StreamrClientError.message', expectedError.message, actualError.message)
    }
    return {
        pass: true,
        message: () => ''
    }
}

expect.extend({
    toThrowStreamError
})
