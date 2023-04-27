const { isFunction } = require('lodash')
const { printExpected, printReceived } = require('jest-matcher-utils')

/**
 * TODO: Get rid of this file before merging, no copy-paste code please.
 */
const formError = (description, expected, actual) => {
    return {
        pass: false,
        message: () => `${description}\nExpected: ${printExpected(expected)}\nReceived: ${printReceived(actual)}`
    }
}

const toThrowStreamrError = (actual, expectedError) => {
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

    if (actualError.constructor.name !== 'StreamrClientError') {
        return formError('Class name', 'StreamrClientError', actualError.constructor.name)
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

module.exports = {
    toThrowStreamrError
}
