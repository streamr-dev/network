import ValidationError from '../errors/ValidationError'

export function validateIsDefined(varName: string, varValue: unknown): void | never {
    if (varValue === undefined) {
        throw new ValidationError(`Expected ${varName} to not be undefined.`)
    }
}

export function validateIsNotNegativeInteger(varName: string, varValue?: number, allowUndefined = false): void | never {
    if (allowUndefined && varValue === undefined) {
        return
    }
    validateIsDefined(varName, varValue)
    if (!Number.isInteger(varValue)) {
        throw new ValidationError(`Expected ${varName} to be an integer but was a ${typeof varValue} (${varValue}).`)
    }
    if (varValue! < 0) {
        throw new ValidationError(`Expected ${varName} to not be negative (${varValue}).`)
    }
}
