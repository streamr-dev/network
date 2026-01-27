import { exposeWorkerApi } from '@/exposeWorkerApi'
import { validateSignatureData, SignatureValidationResult, SignatureValidationData } from './signatureValidationUtils'

const workerApi = {
    validateSignature: async (data: SignatureValidationData): Promise<SignatureValidationResult> => {
        return validateSignatureData(data)
    }
}

export type SignatureValidationWorkerApi = typeof workerApi

exposeWorkerApi(workerApi)
