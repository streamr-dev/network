import { BrandedString } from './types'

export function isENSNameFormatIgnoreCase(str: string): boolean {
    return str.indexOf('.') > 0
}

export type ENSName = BrandedString<'ENSName'>

export function toENSName(str: string): ENSName | never {
    if (isENSNameFormatIgnoreCase(str)) {
        return str.toLowerCase() as ENSName
    }
    throw new Error(`not a valid ENS name: "${str}"`)
}
