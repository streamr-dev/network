/**
 * Web Worker for AES encryption operations.
 * Offloads CPU-intensive cryptographic operations to a separate thread.
 */
import { expose, transfer } from 'comlink'
import { encryptWithAES } from './aesUtils'
import {
    encryptNextGroupKey,
    decryptNextGroupKey,
    decryptStreamMessageContent,
    AESEncryptRequest,
    EncryptGroupKeyRequest,
    DecryptGroupKeyRequest,
    DecryptStreamMessageRequest,
    AESEncryptResult,
    EncryptGroupKeyResult,
    DecryptGroupKeyResult,
    DecryptStreamMessageResult
} from './encryptionUtils'

const workerApi = {
    encrypt: async (request: AESEncryptRequest): Promise<AESEncryptResult> => {
        try {
            const result = encryptWithAES(request.data, request.cipherKey)
            return transfer({ type: 'success', data: result }, [result.buffer])
        } catch (err) {
            return { type: 'error', message: String(err) }
        }
    },

    encryptGroupKey: async (request: EncryptGroupKeyRequest): Promise<EncryptGroupKeyResult> => {
        try {
            const result = encryptNextGroupKey(
                request.nextGroupKeyId,
                request.nextGroupKeyData,
                request.currentGroupKeyData
            )
            return transfer(
                { type: 'success', id: result.id, data: result.data },
                [result.data.buffer]
            )
        } catch (err) {
            return { type: 'error', message: String(err) }
        }
    },

    decryptGroupKey: async (request: DecryptGroupKeyRequest): Promise<DecryptGroupKeyResult> => {
        try {
            const result = decryptNextGroupKey(
                request.encryptedGroupKeyId,
                request.encryptedGroupKeyData,
                request.currentGroupKeyData
            )
            return transfer(
                { type: 'success', id: result.id, data: result.data },
                [result.data.buffer]
            )
        } catch (err) {
            return { type: 'error', message: String(err) }
        }
    },

    decryptStreamMessage: async (request: DecryptStreamMessageRequest): Promise<DecryptStreamMessageResult> => {
        try {
            const result = decryptStreamMessageContent(
                request.content,
                request.groupKeyData,
                request.newGroupKey
            )
            const transferables: ArrayBuffer[] = [result.content.buffer as ArrayBuffer]
            if (result.newGroupKey) {
                transferables.push(result.newGroupKey.data.buffer as ArrayBuffer)
            }
            return transfer(
                { type: 'success', content: result.content, newGroupKey: result.newGroupKey },
                transferables
            )
        } catch (err) {
            return { type: 'error', message: String(err) }
        }
    }
}

export type EncryptionWorkerApi = typeof workerApi

expose(workerApi)
