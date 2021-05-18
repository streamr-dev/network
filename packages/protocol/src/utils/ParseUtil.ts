export function ensureParsed(stringOrObject: unknown): any {
    return typeof stringOrObject === 'string'
        ? JSON.parse(stringOrObject)
        : stringOrObject
}
