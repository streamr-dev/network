/**
 * Singleton encryption service using Web Worker.
 * This offloads CPU-intensive AES encryption operations to a separate thread.
 * Works in both browser and Node.js environments via platform-specific config.
 * 
 * The worker is lazily initialized on first use and shared across all consumers.
 */
import { wrap, releaseProxy, transfer, type Remote } from 'comlink'
import { Lifecycle, scoped } from 'tsyringe'
import { EncryptedGroupKey } from '@streamr/trackerless-network'
import { createEncryptionWorker } from '@/createEncryptionWorker'
import type { EncryptionWorkerApi } from './EncryptionWorker'
import { DestroySignal } from '../DestroySignal'
import { StreamrClientError } from '../StreamrClientError'
import { GroupKey } from './GroupKey'

@scoped(Lifecycle.ContainerScoped)
export class EncryptionService {
    private worker: ReturnType<typeof createEncryptionWorker> | undefined
    private workerApi: Remote<EncryptionWorkerApi> | undefined

    constructor(destroySignal: DestroySignal) {
        destroySignal.onDestroy.listen(() => this.destroy())
    }

    private getWorkerApi(): Remote<EncryptionWorkerApi> {
        if (this.workerApi === undefined) {
            this.worker = createEncryptionWorker()
            this.workerApi = wrap<EncryptionWorkerApi>(this.worker)
        }
        return this.workerApi
    }

    /**
     * Encrypt data using AES-256-CTR.
     * Note: The input data buffer is transferred to the worker and becomes unusable after this call.
     */
    async encryptWithAES(data: Uint8Array, cipherKey: Uint8Array): Promise<Uint8Array> {
        const result = await this.getWorkerApi().encrypt(
            transfer({ data, cipherKey }, [data.buffer])
        )
        if (result.type === 'error') {
            throw new Error(`AES encryption failed: ${result.message}`)
        }
        return result.data
    }

    /**
     * Decrypt AES-256-CTR encrypted data.
     * Note: The input cipher buffer is transferred to the worker and becomes unusable after this call.
     */
    async decryptWithAES(cipher: Uint8Array, cipherKey: Uint8Array): Promise<Uint8Array> {
        const result = await this.getWorkerApi().decrypt(
            transfer({ cipher, cipherKey }, [cipher.buffer])
        )
        if (result.type === 'error') {
            throw new Error(`AES decryption failed: ${result.message}`)
        }
        return result.data
    }

    /**
     * Encrypt the next group key using the current group key.
     */
    async encryptNextGroupKey(currentKey: GroupKey, nextKey: GroupKey): Promise<EncryptedGroupKey> {
        const result = await this.getWorkerApi().encryptGroupKey({
            nextGroupKeyId: nextKey.id,
            nextGroupKeyData: nextKey.data,
            currentGroupKeyData: currentKey.data
        })
        if (result.type === 'error') {
            throw new Error(`Group key encryption failed: ${result.message}`)
        }
        return {
            id: result.id,
            data: result.data
        }
    }

    /**
     * Decrypt an encrypted group key using the current group key.
     */
    async decryptNextGroupKey(currentKey: GroupKey, encryptedKey: EncryptedGroupKey): Promise<GroupKey> {
        const result = await this.getWorkerApi().decryptGroupKey({
            encryptedGroupKeyId: encryptedKey.id,
            encryptedGroupKeyData: encryptedKey.data,
            currentGroupKeyData: currentKey.data
        })
        if (result.type === 'error') {
            throw new Error(`Group key decryption failed: ${result.message}`)
        }
        return new GroupKey(result.id, Buffer.from(result.data))
    }

    /**
     * Decrypt a stream message's content and optionally the new group key.
     * This combines both operations for efficiency when processing messages.
     * Note: The input content buffer is transferred to the worker and becomes unusable after this call.
     */
    async decryptStreamMessage(
        content: Uint8Array,
        groupKey: GroupKey,
        encryptedNewGroupKey?: EncryptedGroupKey
    ): Promise<[Uint8Array, GroupKey?]> {
        const request = {
            content,
            groupKeyData: groupKey.data,
            newGroupKey: encryptedNewGroupKey ? {
                id: encryptedNewGroupKey.id,
                data: encryptedNewGroupKey.data
            } : undefined
        }
        const result = await this.getWorkerApi().decryptStreamMessage(
            transfer(request, [content.buffer])
        )
        if (result.type === 'error') {
            throw new StreamrClientError(`AES decryption failed: ${result.message}`, 'DECRYPT_ERROR')
        }
        
        let newGroupKey: GroupKey | undefined
        if (result.newGroupKey) {
            newGroupKey = new GroupKey(result.newGroupKey.id, Buffer.from(result.newGroupKey.data))
        }
        
        return [result.content, newGroupKey]
    }

    destroy(): void {
        if (this.workerApi !== undefined) {
            this.workerApi[releaseProxy]()
            this.workerApi = undefined
        }
        if (this.worker !== undefined) {
            this.worker.terminate()
            this.worker = undefined
        }
    }
}
