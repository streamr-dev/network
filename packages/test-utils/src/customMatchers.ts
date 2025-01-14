import { printExpected, printReceived } from 'jest-matcher-utils'
import { areEqualBinaries, binaryToHex } from '@streamr/utils'

export interface CustomMatchers<R = unknown> {
    toEqualBinary(expected: Uint8Array): R
}

const formErrorMessage = (description: string, expected: string, actual: string): string => {
    return `${description}\nExpected: ${printExpected(expected)}\nReceived: ${printReceived(actual)}`
}

const formTypeDescription = (value: unknown): string => {
    if (value !== undefined && value !== null) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        return `an instance of ${(value as any).constructor.name}`
    } else {
        return String(value)
    }
}

const toEqualBinary = (actual: unknown, expected: Uint8Array): jest.CustomMatcherResult => {
    if (!(actual instanceof Uint8Array)) {
        return {
            pass: false,
            message: () => `Not an instance of Uint8Array (the object is ${formTypeDescription(actual)})`
        }
    }
    if (!(expected instanceof Uint8Array)) {
        return {
            pass: false,
            message: () =>
                `Invalid assertion: the "expected" object should be an instance of Uint8Array (it is ${formTypeDescription(expected)})`
        }
    }
    const areEqual = areEqualBinaries(actual, expected)
    return {
        pass: areEqual,
        message: () => {
            if (!areEqual) {
                return formErrorMessage(
                    'Binaries are not equal\n',
                    binaryToHex(expected, true),
                    binaryToHex(actual, true)
                )
            } else {
                return `Binaries are equal\n\nReceived:${printReceived(binaryToHex(actual, true))}`
            }
        }
    }
}

export { toEqualBinary }
