import * as Comlink from 'comlink'
import nodeEndpoint from 'comlink/dist/umd/node-adapter'
import { Worker } from "worker_threads"
import { StreamMessage } from '../protocol/StreamMessage'
import { SignatureValidationContext } from './SignatureValidationContext'
import { SignatureValidationWorkerApi } from './SignatureValidationWorker'
import { SignatureValidationResult } from './signatureValidation'
import { join } from 'path'

export default class ServerSignatureValidation implements SignatureValidationContext {

    private readonly worker: Worker
    private readonly workerApi: Comlink.Remote<SignatureValidationWorkerApi>
    constructor() {
        const isRunningFromDist = __dirname.includes('/dist/')
        const workerPath = isRunningFromDist
            ? join(__dirname, 'SignatureValidationWorker.js')
            : join(__dirname, '../../dist/src/signature/SignatureValidationWorker.js')
        this.worker = new Worker(workerPath)
        this.workerApi = Comlink.wrap<SignatureValidationWorkerApi>(nodeEndpoint(this.worker))
    }

    async validateSignature(message: StreamMessage): Promise<SignatureValidationResult> {
        console.log('validateSignature', message)
        return this.workerApi.validateSignature(message)
    }

    // eslint-disable-next-line class-methods-use-this
    destroy(): void {
        // No-op for server implementation
    }
}

