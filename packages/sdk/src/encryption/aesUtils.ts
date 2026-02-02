/**
 * Low-level AES-256-CTR encryption utilities.
 * Shared between EncryptionUtil (for ML-KEM key wrapping) and encryptionUtils (for stream message encryption).
 */
import { randomBytes } from '@noble/post-quantum/utils'
import { createCipheriv, createDecipheriv } from '@streamr/utils'

export const INITIALIZATION_VECTOR_LENGTH = 16

/**
 * Concatenate multiple Uint8Arrays into a single Uint8Array.
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
    }
    return result
}

/**
 * Encrypt data using AES-256-CTR.
 * Returns IV prepended to ciphertext.
 */
export function encryptWithAES(data: Uint8Array, cipherKey: Uint8Array): Uint8Array {
    const iv = randomBytes(INITIALIZATION_VECTOR_LENGTH) // always need a fresh IV when using CTR mode
    const cipher = createCipheriv('aes-256-ctr', cipherKey, iv)
    return concatBytes(iv, cipher.update(data), cipher.final())
}

/**
 * Decrypt AES-256-CTR encrypted data.
 * Expects IV prepended to ciphertext.
 */
export function decryptWithAES(cipher: Uint8Array, cipherKey: Uint8Array): Uint8Array {
    const iv = cipher.slice(0, INITIALIZATION_VECTOR_LENGTH)
    const decipher = createDecipheriv('aes-256-ctr', cipherKey, iv)
    return concatBytes(decipher.update(cipher.slice(INITIALIZATION_VECTOR_LENGTH)), decipher.final())
}
