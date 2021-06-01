import { Request } from 'express'

export const parsePositiveInteger = (n: string): number | never => {
    const parsed = parseInt(n)
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${n} is not a valid positive integer`)
    }
    return parsed
}

export const parseTimestamp = (millisOrString: number|string) => {
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

export const getQueryParameter = (name: string, req: Request, parser?: (input: string) => any) => {
    const value = req.query[name] as string
    if (value !== undefined) {
        return (parser !== undefined) ? parser(value) : value
    } else {
        return undefined
    }
}
