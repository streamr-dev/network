export const binaryToUtf8 = (bytes: Uint8Array): string => {
    return new TextDecoder().decode(bytes)
}

export const utf8ToBinary = (utf8: string): Uint8Array => {
    return new TextEncoder().encode(utf8)
}

export const binaryToHex = (bytes: Uint8Array, addPrefix = false): string => {
    if (addPrefix) {
        return `0x${Buffer.from(bytes).toString('hex')}`
    }
    return Buffer.from(bytes).toString('hex')
}

export const hexToBinary = (hex: string): Uint8Array => {
    if (hex.startsWith('0x')) {
        hex = hex.slice(2)
    }
    if (hex.length % 2 !== 0) {
        throw new Error(`Hex string length must be even, received: 0x${hex}`)
    }
    if (!/^[0-9a-fA-F]*$/.test(hex)) {
        throw new Error(`Hex string input is likely malformed, received: 0x${hex}`)
    }
    const result = new Uint8Array(hex.length / 2)
    for (let i = 0; i < result.length; i++) {
        result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return result
}

export const areEqualBinaries = (arr1: Uint8Array, arr2: Uint8Array): boolean => {
    return Buffer.compare(arr1, arr2) === 0
}
