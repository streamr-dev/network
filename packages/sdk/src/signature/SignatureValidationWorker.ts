import * as Comlink from 'comlink'
import { validateSignatureData, SignatureValidationResult } from './signatureValidation'
import { StreamMessage } from '../protocol/StreamMessage'

const workerApi = {
    validateSignature: async (data: StreamMessage): Promise<SignatureValidationResult> => {
        return validateSignatureData(data)
    }
}

export type SignatureValidationWorkerApi = typeof workerApi

// Detect environment and expose accordingly
if (typeof self !== 'undefined') {
    // Browser Web Worker
    Comlink.expose(workerApi)
} else {
    // Node.js Worker Thread
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parentPort } = require('worker_threads')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeEndpoint = require('comlink/dist/umd/node-adapter')
    Comlink.expose(workerApi, nodeEndpoint(parentPort))
}
