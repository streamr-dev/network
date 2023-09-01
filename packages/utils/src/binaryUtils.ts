const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export const binaryToUtf8 = (bytes: Uint8Array): string => {
    return textDecoder.decode(bytes)
}

export const utf8ToBinary = (utf8: string): Uint8Array => {
    return textEncoder.encode(utf8)
}

export const binaryToHex = (bytes: Uint8Array, addPrefix = false): string => {
    if (addPrefix) {
        return `0x${Buffer.from(bytes).toString('hex')}`
    }
    return Buffer.from(bytes).toString('hex')
}

export const hexToBinary = (hex: string): Uint8Array | undefined => {
    if (hex.startsWith('0x')) {
        hex = hex.slice(2)
    }
    if (hex.length % 2 !== 0) {
        return undefined
    }
    const result = Buffer.from(hex, 'hex')
    return (hex.length - (hex.length % 2)) === result.length * 2 ? result : undefined
}

export const areEqualBinaries = (arr1: Uint8Array, arr2: Uint8Array): boolean => {
    return Buffer.compare(arr1, arr2) === 0
}
