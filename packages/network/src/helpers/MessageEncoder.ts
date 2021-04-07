export function decode<M, R>(serializedMessage: M, deserializeFn: (serializedMessage: M) => R): R | null | never {
    try {
        return deserializeFn(serializedMessage)
    } catch (e) {
        // JSON parsing failed, version parse failed, type parse failed
        if (e.name === 'SyntaxError' || e.version != null || e.type != null) {
            return null
        }
        throw e
    }
}
