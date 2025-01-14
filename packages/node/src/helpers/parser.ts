import { ParsedQs, parse } from 'qs'

export const parsePositiveInteger = (n: string): number | never => {
    const parsed = parseInt(n)
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${n} is not a valid positive integer`)
    }
    return parsed
}

export const parseTimestamp = (millisOrString: number | string): number | never => {
    if (typeof millisOrString === 'number') {
        return millisOrString
    }
    if (typeof millisOrString === 'string') {
        // Try if this string represents a number
        const timestamp = Number(millisOrString) || Date.parse(millisOrString)
        if (Number.isNaN(timestamp)) {
            throw new Error(`Invalid timestamp: ${millisOrString}`)
        } else {
            return timestamp
        }
    } else {
        throw new Error(`Invalid timestamp: ${millisOrString}`)
    }
}

export const parseQueryParameter = <T>(name: string, query: ParsedQs, parser: (input: string) => T): T | undefined => {
    const value = query[name] as string
    if (value !== undefined) {
        return parser(value)
    } else {
        return undefined
    }
}

export const parseQueryParameterArray = <T>(
    name: string,
    query: ParsedQs,
    parser: (input: string) => T
): T[] | undefined => {
    return parseQueryParameter(name, query, (input) => input.split(',').map((part) => parser(part)))
}

export const parseQueryAndBase = (str: string): { base: string; query: ParsedQs } => {
    const queryParameterStartPos = str.lastIndexOf('?')
    if (queryParameterStartPos !== -1) {
        return {
            base: str.substring(0, queryParameterStartPos),
            query: parse(str.substring(queryParameterStartPos + 1))
        }
    } else {
        return {
            base: str,
            query: {}
        }
    }
}
