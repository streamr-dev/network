import { expose } from 'comlink'
import {
    createSignatureFromData,
    SigningResult,
    SigningRequest,
} from './signingUtils'

const workerApi = {
    createSignature: async (
        request: SigningRequest
    ): Promise<SigningResult> => {
        return createSignatureFromData(request)
    },
}

export type SigningWorkerApi = typeof workerApi

expose(workerApi)
