/**
 * Interface for signature validation backend.
 * Browser implementation uses a Web Worker, Node.js runs on main thread.
 */
import { StreamMessage } from '../protocol/StreamMessage'
import { SignatureValidationResult } from './signatureValidation'

export interface SignatureValidationContext {
    validateSignature(message: StreamMessage): Promise<SignatureValidationResult>
    destroy(): void
}

