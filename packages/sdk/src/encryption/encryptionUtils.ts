/**
 * Higher-level encryption logic - shared between worker and main thread implementations.
 * This file contains pure cryptographic functions without any network dependencies.
 * 
 * For low-level AES operations, see aesUtils.ts
 */
import { decryptWithAES, encryptWithAES } from './aesUtils'

/**
 * Request types for worker communication
 */
export interface AESEncryptRequest {
    data: Uint8Array
    cipherKey: Uint8Array
}

export interface AESDecryptRequest {
    cipher: Uint8Array
    cipherKey: Uint8Array
}

export interface EncryptGroupKeyRequest {
    nextGroupKeyId: string
    nextGroupKeyData: Uint8Array
    currentGroupKeyData: Uint8Array
}

export interface DecryptGroupKeyRequest {
    encryptedGroupKeyId: string
    encryptedGroupKeyData: Uint8Array
    currentGroupKeyData: Uint8Array
}

export interface DecryptStreamMessageRequest {
    content: Uint8Array
    groupKeyData: Uint8Array
    newGroupKey?: {
        id: string
        data: Uint8Array
    }
}

/**
 * Result types for worker communication
 */
export type AESEncryptResult =
    | { type: 'success', data: Uint8Array }
    | { type: 'error', message: string }

export type AESDecryptResult =
    | { type: 'success', data: Uint8Array }
    | { type: 'error', message: string }

export type EncryptGroupKeyResult =
    | { type: 'success', id: string, data: Uint8Array }
    | { type: 'error', message: string }

export type DecryptGroupKeyResult =
    | { type: 'success', id: string, data: Uint8Array }
    | { type: 'error', message: string }

export type DecryptStreamMessageResult =
    | { type: 'success', content: Uint8Array, newGroupKey?: { id: string, data: Uint8Array } }
    | { type: 'error', message: string }

/**
 * Encrypt a next group key using the current group key.
 */
export function encryptNextGroupKey(
    nextGroupKeyId: string,
    nextGroupKeyData: Uint8Array,
    currentGroupKeyData: Uint8Array
): { id: string, data: Uint8Array } {
    return {
        id: nextGroupKeyId,
        data: encryptWithAES(nextGroupKeyData, currentGroupKeyData)
    }
}

/**
 * Decrypt an encrypted group key using the current group key.
 */
export function decryptNextGroupKey(
    encryptedGroupKeyId: string,
    encryptedGroupKeyData: Uint8Array,
    currentGroupKeyData: Uint8Array
): { id: string, data: Uint8Array } {
    return {
        id: encryptedGroupKeyId,
        data: decryptWithAES(encryptedGroupKeyData, currentGroupKeyData)
    }
}

/**
 * Decrypt a stream message content and optionally the new group key.
 */
export function decryptStreamMessageContent(
    content: Uint8Array,
    groupKeyData: Uint8Array,
    newGroupKey?: { id: string, data: Uint8Array }
): { content: Uint8Array, newGroupKey?: { id: string, data: Uint8Array } } {
    const decryptedContent = decryptWithAES(content, groupKeyData)
    
    let decryptedNewGroupKey: { id: string, data: Uint8Array } | undefined
    if (newGroupKey) {
        decryptedNewGroupKey = decryptNextGroupKey(newGroupKey.id, newGroupKey.data, groupKeyData)
    }
    
    return {
        content: decryptedContent,
        newGroupKey: decryptedNewGroupKey
    }
}
