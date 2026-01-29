/**
 * Singleton signing service using Web Worker.
 * This offloads CPU-intensive cryptographic operations to a separate thread.
 * Works in both browser and Node.js environments via platform-specific config.
 * 
 * The worker is lazily initialized on first use and shared across all MessageSigner instances.
 */
import { wrap, releaseProxy, type Remote } from 'comlink'
import { Lifecycle, scoped } from 'tsyringe'
import { createSigningWorker } from '@/createSigningWorker'
import { SigningResult, SigningRequest } from './signingUtils'
import type { SigningWorkerApi } from './SigningWorker'
import { DestroySignal } from '../DestroySignal'

@scoped(Lifecycle.ContainerScoped)
export class SigningService {
    private worker: ReturnType<typeof createSigningWorker> | undefined
    private workerApi: Remote<SigningWorkerApi> | undefined

    constructor(destroySignal: DestroySignal) {
        destroySignal.onDestroy.listen(() => this.destroy())
    }

    private getWorkerApi(): Remote<SigningWorkerApi> {
        if (this.workerApi === undefined) {
            this.worker = createSigningWorker()
            this.workerApi = wrap<SigningWorkerApi>(this.worker)
        }
        return this.workerApi
    }

    async sign(request: SigningRequest): Promise<SigningResult> {
        return this.getWorkerApi().createSignature(request)
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
