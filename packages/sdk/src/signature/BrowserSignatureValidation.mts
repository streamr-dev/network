/**
 * Browser implementation of signature validation using Web Worker.
 * This offloads CPU-intensive cryptographic operations to a separate thread.
 */
import * as Comlink from 'comlink'
import { SignatureValidationContext } from './SignatureValidationContext.js'
import { SignatureValidationResult } from './signatureValidation.js'
import type { SignatureValidationWorkerApi } from './SignatureValidationWorker.js'
import { StreamMessage } from '../protocol/StreamMessage.js'

export default class BrowserSignatureValidation implements SignatureValidationContext {
    private worker: Worker
    private workerApi: Comlink.Remote<SignatureValidationWorkerApi> 

    constructor() {
        // Webpack 5 handles this pattern automatically, creating a separate chunk for the worker
        this.worker = new Worker(
            /* webpackChunkName: "signature-worker" */
            new URL('./SignatureValidationWorker.js', import.meta.url)
        )
        this.workerApi = Comlink.wrap<SignatureValidationWorkerApi>(this.worker)
    }

    async validateSignature(message: StreamMessage): Promise<SignatureValidationResult> {
        return this.workerApi.validateSignature(message)
    }

    destroy(): void {
        if (this.worker) {
            this.worker.terminate()
        }
    }
}
