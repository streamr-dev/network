import { expose, transfer } from 'comlink'
import {
    createSignatureFromData,
    SigningResult,
    SigningRequest,
} from './signingUtils'

const workerApi = {
    createSignature: async (
        request: SigningRequest
    ): Promise<SigningResult> => {
        const result = await createSignatureFromData(request)
        if (result.type === 'success') {
            return transfer(result, [result.signature.buffer])
        }
        return result
    },
}

export type SigningWorkerApi = typeof workerApi

expose(workerApi)
