import md5 from 'md5'
import { sha1 } from '@noble/hashes/legacy.js'

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
    return Buffer.from(md5(input), 'hex')
}

export function computeSha1(input: string): Buffer {
    return sha1(new TextEncoder().encode(input)) as Buffer
}

export type Jwk = JsonWebKey

export type CryptoKey = globalThis.CryptoKey
