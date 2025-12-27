import * as Comlink from 'comlink'
import { validateSignatureData, SignatureValidationResult, SignatureValidationData } from './signatureValidation'

const workerApi = {
    validateSignature: async (data: SignatureValidationData): Promise<SignatureValidationResult> => {
        return validateSignatureData(data)
    }
}

export type SignatureValidationWorkerApi = typeof workerApi

// Detect environment and expose accordingly
// Check for Node.js worker_threads first, since `self` is defined in both environments
// but only browser Web Workers have WorkerGlobalScope with addEventListener
let parentPort: import('worker_threads').MessagePort | null = null
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    parentPort = require('worker_threads').parentPort
} catch {
    // Not in Node.js environment
}

if (parentPort) {
    // Node.js Worker Thread
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeEndpoint = require('comlink/dist/umd/node-adapter')
    Comlink.expose(workerApi, nodeEndpoint(parentPort))
} else {
    // Browser Web Worker
    Comlink.expose(workerApi)
}
