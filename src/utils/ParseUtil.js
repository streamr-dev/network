export function ensureParsed(stringOrObject) {
    return (typeof stringOrObject === 'string' ? JSON.parse(stringOrObject) : stringOrObject)
}
