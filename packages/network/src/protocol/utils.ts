export function decode<R>(serializedMessage: string, deserializeFn: (serializedMessage: string) => R): R | null | never {
    try {
        return deserializeFn(serializedMessage)
    } catch {
        return null
    }
}
