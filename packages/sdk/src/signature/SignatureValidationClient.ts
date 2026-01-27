/**
 * Unified signature validation using Web Worker.
 * This offloads CPU-intensive cryptographic operations to a separate thread.
 * Works in both browser and Node.js environments via platform-specific config.
 */
import * as Comlink from 'comlink'
import { createSignatureValidationWorker } from '@/createSignatureValidationWorker'
import { SignatureValidationResult, toSignatureValidationData } from './signatureValidation'
import type { SignatureValidationWorkerApi } from './SignatureValidationWorker'
import { StreamMessage } from '../protocol/StreamMessage'

export class SignatureValidation {
    private worker: ReturnType<typeof createSignatureValidationWorker>
    private workerApi: Comlink.Remote<SignatureValidationWorkerApi>

    constructor() {
        this.worker = createSignatureValidationWorker()
        this.workerApi = Comlink.wrap<SignatureValidationWorkerApi>(this.worker)
    }

    async validateSignature(message: StreamMessage): Promise<SignatureValidationResult> {
        // Convert class instance to plain serializable data before sending to worker
        const data = toSignatureValidationData(message)
        return this.workerApi.validateSignature(data)
    }

    destroy(): void {
        if (this.worker) {
            this.worker.terminate()
        }
    }
}
