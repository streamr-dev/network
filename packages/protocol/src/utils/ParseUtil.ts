export function ensureParsed(stringOrObject: any) {
    return typeof stringOrObject === 'string'
        ? JSON.parse(stringOrObject)
        : stringOrObject
}
