import ValidationError from '../errors/ValidationError'
import { ProxyDirection } from './types'

export function validateIsNotNullOrUndefined(varName: string, varValue: unknown): void | never {
    if (varValue === undefined) {
        throw new ValidationError(`Expected ${varName} to not be undefined.`)
    }
    if (varValue == null) {
        throw new ValidationError(`Expected ${varName} to not be null.`)
    }
}

export function validateIsString(varName: string, varValue: unknown, allowNull = false): void | never {
    if (allowNull && varValue == null) {
        return
    }
    validateIsNotNullOrUndefined(varName, varValue)
    if (typeof varValue !== 'string' && !(varValue instanceof String)) {
        throw new ValidationError(`Expected ${varName} to be a string but was a ${typeof varValue} (${varValue}).`)
    }
}

export function validateIsNotEmptyString(varName: string, varValue: unknown, allowNull = false): void | never {
    if (allowNull && varValue == null) {
        return
    }
    validateIsString(varName, varValue)
    if ((varValue as string).length === 0) {
        throw new ValidationError(`Expected ${varName} to not be an empty string.`)
    }
}

export function validateIsInteger(varName: string, varValue: unknown, allowNull = false): void | never {
    if (allowNull && varValue == null) {
        return
    }
    validateIsNotNullOrUndefined(varName, varValue)
    if (!Number.isInteger(varValue)) {
        throw new ValidationError(`Expected ${varName} to be an integer but was a ${typeof varValue} (${varValue}).`)
    }
}

export function validateIsNotNegativeInteger(varName: string, varValue: unknown, allowNull = false): void | never {
    if (allowNull && varValue == null) {
        return
    }
    validateIsInteger(varName, varValue)
    if ((varValue as number) < 0) {
        throw new ValidationError(`Expected ${varName} to not be negative (${varValue}).`)
    }
}

export function validateIsArray(varName: string, varValue: unknown, allowNull = false): void | never {
    if (allowNull && varValue == null) {
        return
    }
    validateIsNotNullOrUndefined(varName, varValue)
    if (!Array.isArray(varValue)) {
        throw new ValidationError(`Expected ${varName} to be an array but was a ${typeof varValue} (${varValue}).`)
    }
}

export function validateIsDirection(varName: string, varValue: unknown, allowNull = false): void | never {
    if (allowNull && varValue == null) {
        return
    }
    validateIsNotNullOrUndefined(varName, varValue)
    if (varValue as ProxyDirection in ProxyDirection) {
        throw new ValidationError(`Expected ${varName} to be a ProxyDirection but was a ${typeof varValue} (${varValue}).`)
    }
}

export function validateIsType(
    varName: string,
    varValue: unknown,
    typeName: string,
    typeClass: unknown,
    allowNull = false
): void | never {
    if (allowNull && varValue == null) {
        return
    }
    if (!(varValue instanceof (typeClass as any))) {
        const msg = `Expected ${varName} to be an instance of (${typeName}), but it was: ${JSON.stringify(varValue)}`
        throw new ValidationError(msg)
    }
}

export function validateIsOneOf(
    varName: string,
    varValue: unknown,
    validValues: ReadonlyArray<any>,
    allowNull = false
): void | never {
    if (allowNull && varValue == null) {
        return
    }
    validateIsNotNullOrUndefined(varName, varValue)
    if (!validValues.includes(varValue)) {
        const msg = `Expected ${varName} to be one of ${JSON.stringify(validValues)} but was (${varValue}).`
        throw new ValidationError(msg)
    }
}
