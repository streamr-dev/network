import * as Comlink from 'comlink'
import { validateSignatureData, SignatureValidationResult, SignatureValidationData } from './signatureValidation'

const workerApi = {
    validateSignature: async (data: SignatureValidationData): Promise<SignatureValidationResult> => {
        return validateSignatureData(data)
    }
}

export type SignatureValidationWorkerApi = typeof workerApi

Comlink.expose(workerApi)
