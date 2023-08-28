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

export const hexToBinary = (hex: string): Uint8Array => {
    if (hex.startsWith('0x')) {
        hex = hex.slice(2)
    }
    return Buffer.from(hex, 'hex')
}

export const areEqualBinaries = (a: Uint8Array, b: Uint8Array): boolean => {
    return Buffer.compare(a, b) === 0
}
