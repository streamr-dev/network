import md5 from 'md5'
import { hexToBinary } from '../binaryUtils'

export function getSubtle(): SubtleCrypto {
    const { crypto } = globalThis

    if (!crypto?.subtle) {
        const url =
            'https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto'
        throw new Error(
            `SubtleCrypto not supported. This feature is available only in secure contexts (HTTPS). ${url}`
        )
    }

    return crypto.subtle
}

export function computeMd5(input: string): Buffer {
    return Buffer.from(hexToBinary(md5(input)))
}

export type Jwk = JsonWebKey

export type CryptoKey = globalThis.CryptoKey
