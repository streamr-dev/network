export enum OptionType {
    FLAG, // e.g. "--enable"
    ARGUMENT // e.g. "--private-key 0x1234"
}

export const getOptionType = (value: string | boolean): OptionType | never => {
    if (typeof value === 'boolean') {
        return OptionType.FLAG
    } else if (typeof value === 'string') {
        return OptionType.ARGUMENT
    } else {
        throw new Error(`unknown option type (value: ${value})`)
    }
}

export function createFnParseInt(name: string): (s: string) => number {
    return (str: string) => {
        const n = parseInt(str, 10)
        if (isNaN(n)) {
            console.error(`${name} must be an integer (was "${str}")`)
            process.exit(1)
        }
        return n
    }
}

export function createFnParseEnum(name: string, allowedValues: string[]): (s: string) => string {
    return (value: string) => {
        if (!allowedValues.includes(value)) {
            console.error(`${name} must be one of: ${allowedValues.map((s) => wrapWithQuotes(s)).join(', ')}`)
            process.exit(1)
        }
        return value
    }
}

export const formEnumArgValueDescription = (allowedValues: string[], defaultValue: string): string => {
    return `one of: ${allowedValues.map(wrapWithQuotes).join(', ')}, default: ${wrapWithQuotes(defaultValue)}`
}

export const wrapWithQuotes = (str: string): string => {
    return `"${str}"`
}
