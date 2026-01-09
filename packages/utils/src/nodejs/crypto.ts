import crypto, { type webcrypto } from 'crypto'

export function getSubtle(): crypto.webcrypto.SubtleCrypto {
    const subtle = crypto.webcrypto.subtle

    if (!subtle) {
        const url =
            'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto'
        throw new Error(
            `SubtleCrypto not supported. This feature is available only in Node 16+. ${url}`
        )
    }

    return subtle
}

export type Jwk = webcrypto.JsonWebKey

export type CryptoKey = webcrypto.CryptoKey

export function computeMd5(input: string): Buffer {
    return crypto.createHash('md5').update(input).digest()
}

export function computeSha1(input: string): Buffer {
    return crypto.createHash('sha1').update(input).digest()
}

export function createCipheriv(
    algorithm: string,
    key: Buffer | Uint8Array,
    iv: Buffer | Uint8Array | null
): crypto.Cipheriv {
    return crypto.createCipheriv(algorithm, key, iv)
}

export function createDecipheriv(
    algorithm: string,
    key: Buffer | Uint8Array,
    iv: Buffer | Uint8Array | null
): crypto.Decipheriv {
    return crypto.createDecipheriv(algorithm, key, iv)
}
