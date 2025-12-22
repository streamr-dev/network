import * as Comlink from 'comlink'
import { validateSignatureData, SignatureValidationResult } from './signatureValidation'
import { StreamMessage } from '../protocol/StreamMessage'

const workerApi = {
    validateSignature: async (data: StreamMessage): Promise<SignatureValidationResult> => {
        return validateSignatureData(data)
    }
}

export type SignatureValidationWorkerApi = typeof workerApi

Comlink.expose(workerApi)
