/**
 * Node.js implementation of signature validation.
 * Runs on the main thread (worker threads can be added later if needed).
 */
import { StreamMessage } from '../protocol/StreamMessage'
import { SignatureValidationContext } from './SignatureValidationContext'
import { SignatureValidationResult, validateSignatureData } from './signatureValidation'

export default class ServerSignatureValidation implements SignatureValidationContext {

    async validateSignature(message: StreamMessage): Promise<SignatureValidationResult> {
        return validateSignatureData(message)
    }

    // eslint-disable-next-line class-methods-use-this
    destroy(): void {
        // No-op for server implementation
    }
}

