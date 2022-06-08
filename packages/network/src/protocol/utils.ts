export function decode<R>(serializedMessage: string, deserializeFn: (serializedMessage: string) => R): R | null {
    try {
        return deserializeFn(serializedMessage)
    } catch {
        return null
    }
}
