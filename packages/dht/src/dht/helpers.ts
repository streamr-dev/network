export const generateId = (stringId: string): Uint8Array => {
    return Uint8Array.from(Buffer.from(stringId))
}