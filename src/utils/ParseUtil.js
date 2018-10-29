module.exports = {
    ensureParsed: (stringOrObject) => (typeof stringOrObject === 'string' ? JSON.parse(stringOrObject) : stringOrObject),
}
