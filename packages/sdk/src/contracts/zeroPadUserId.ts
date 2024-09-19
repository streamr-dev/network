/**
 * Zero-pads the given data to the specified length.
 */
function zeroPad(data: Uint8Array, length: number): Uint8Array {
    const result = new Uint8Array(length)
    result.set(data, length - data.length)
    return result
}

export function zeroPadUserId(userId: Uint8Array): Uint8Array {
    return zeroPad(userId, 32)
}
