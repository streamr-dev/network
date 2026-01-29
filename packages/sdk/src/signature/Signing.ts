/**
 * Unified signing using Web Worker.
 * This offloads CPU-intensive cryptographic operations to a separate thread.
 * Works in both browser and Node.js environments via platform-specific config.
 */
import { wrap, releaseProxy, type Remote } from 'comlink'
import { createSigningWorker } from '@/createSigningWorker'
import { SigningResult, SigningRequest } from './signingUtils'
import type { SigningWorkerApi } from './SigningWorker'

export class Signing {
    private worker: ReturnType<typeof createSigningWorker>
    private workerApi: Remote<SigningWorkerApi>

    constructor() {
        this.worker = createSigningWorker()
        this.workerApi = wrap<SigningWorkerApi>(this.worker)
    }

    async createSignature(request: SigningRequest): Promise<SigningResult> {
        return this.workerApi.createSignature(request)
    }

    destroy(): void {
        this.workerApi[releaseProxy]()
        this.worker.terminate()
    }
}
