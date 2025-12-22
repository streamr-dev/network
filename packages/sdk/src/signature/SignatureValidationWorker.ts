/**
 * Web Worker for signature validation.
 * This worker handles CPU-intensive cryptographic operations off the main thread.
 */
import * as Comlink from 'comlink'
import { validateSignatureData, SignatureValidationResult } from './signatureValidation'
import { StreamMessage } from '../protocol/StreamMessage'

export class SignatureValidationWorkerApi {
    async validateSignature(data: StreamMessage): Promise<SignatureValidationResult> {
        return validateSignatureData(data)
    }
}

Comlink.expose(SignatureValidationWorkerApi)
