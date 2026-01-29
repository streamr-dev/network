/**
 * Core signing logic - shared between worker and main thread implementations.
 * This file contains pure cryptographic signing functions without any network dependencies.
 */
import { SigningUtil } from '@streamr/utils'
import { SignatureType } from '@streamr/trackerless-network'
import { IDENTITY_MAPPING } from '../identity/IdentityMapping'
import { createSignaturePayload, SignaturePayloadInput } from './createSignaturePayload'

// Lookup structure SignatureType -> SigningUtil
const signingUtilBySignatureType: Record<number, SigningUtil> = Object.fromEntries(
    IDENTITY_MAPPING.map((idMapping) => [idMapping.signatureType, SigningUtil.getInstance(idMapping.keyType)])
)

/**
 * Result of signing
 */
export type SigningResult = 
    | { type: 'success', signature: Uint8Array }
    | { type: 'error', message: string }

/**
 * Complete signing request including private key and signature type.
 */
export interface SigningRequest {
    payloadInput: SignaturePayloadInput
    privateKey: Uint8Array
    signatureType: SignatureType
}

/**
 * Create a signature for the given data.
 * This is the core signing logic that can be run in a worker.
 */
export async function createSignatureFromData(request: SigningRequest): Promise<SigningResult> {
    try {
        const signingUtil = signingUtilBySignatureType[request.signatureType]
        if (!signingUtil) {
            return { type: 'error', message: `Unsupported signatureType: "${request.signatureType}"` }
        }
        
        const payload = createSignaturePayload(request.payloadInput)
        const signature = await signingUtil.createSignature(payload, request.privateKey)
        return { type: 'success', signature }
    } catch (err) {
        return { type: 'error', message: String(err) }
    }
}
