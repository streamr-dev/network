import md5 from 'md5'
import {
    createCipheriv as createCipherivUtil,
    createDecipheriv as createDecipherivUtil,
} from 'browserify-aes'
import aesModes from 'browserify-aes/modes'
import { sha1 } from '@noble/hashes/legacy.js'
import type { Transform } from 'readable-stream'
import { utf8ToBinary } from '../binaryUtils'

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
    return Buffer.from(sha1(utf8ToBinary(input)))
}

export type Jwk = JsonWebKey

export type CryptoKey = globalThis.CryptoKey

export function createCipheriv(
    algorithm: string,
    key: Buffer | Uint8Array,
    iv: Buffer | Uint8Array | null
): Transform {
    const suite = algorithm.toLowerCase()

    if (aesModes[suite]) {
        return createCipherivUtil(suite, key, iv)
    }

    throw new TypeError(
        `Invalid suite type.  In browser only AES is supported but got ${algorithm}.`
    )
}

export function createDecipheriv(
    algorithm: string,
    key: Buffer | Uint8Array,
    iv: Buffer | Uint8Array | null
): Transform {
    const suite = algorithm.toLowerCase()

    if (aesModes[suite]) {
        return createDecipherivUtil(suite, key, iv)
    }

    throw new TypeError(
        `Invalid suite type.  In browser only AES is supported but got ${algorithm}.`
    )
}
