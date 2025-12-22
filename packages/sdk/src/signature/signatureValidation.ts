/**
 * Core signature validation logic - shared between worker and main thread implementations.
 * This file contains pure cryptographic validation functions without any network dependencies.
 */
import { SigningUtil, toUserIdRaw } from '@streamr/utils'
import { SignatureType } from '@streamr/trackerless-network'
import { IDENTITY_MAPPING } from '../identity/IdentityMapping'
import { createSignaturePayload } from './createSignaturePayload'
import { createLegacySignaturePayload } from './createLegacySignaturePayload'
import { StreamMessage } from '../protocol/StreamMessage'

// Lookup structure SignatureType -> SigningUtil
const signingUtilBySignatureType: Record<number, SigningUtil> = Object.fromEntries(
    IDENTITY_MAPPING.map((idMapping) => [idMapping.signatureType, SigningUtil.getInstance(idMapping.keyType)])
)

const evmSigner = SigningUtil.getInstance('ECDSA_SECP256K1_EVM')

/**
 * Result of signature validation
 */
export type SignatureValidationResult = 
    | { type: 'valid' }
    | { type: 'invalid' }
    | { type: 'requires_erc1271' }
    | { type: 'error'; message: string }

/**
 * Validate signature using extracted data.
 * This is the core validation logic that can be run in a worker.
 */
export async function validateSignatureData(message: StreamMessage): Promise<SignatureValidationResult> {
    try {
        const signingUtil = signingUtilBySignatureType[message.signatureType]
        // Common case: standard signature types
        if (signingUtil) {
            const payload = createSignaturePayload({
                messageId: message.messageId,
                content: message.content,
                messageType: message.messageType,
                prevMsgRef: message.prevMsgRef,
                newGroupKey: message.newGroupKey,
            })
            const isValid = await signingUtil.verifySignature(
                toUserIdRaw(message.messageId.publisherId),
                payload,
                message.signature
            )
            return isValid ? { type: 'valid' } : { type: 'invalid' }
        }
        // Special handling: legacy signature type
        if (message.signatureType === SignatureType.ECDSA_SECP256K1_LEGACY) {
            const payload = createLegacySignaturePayload({
                messageId: message.messageId,
                content: message.content,
                encryptionType: message.encryptionType,
                prevMsgRef: message.prevMsgRef,
                newGroupKey: message.newGroupKey,
            })
            const isValid = await evmSigner.verifySignature(
                toUserIdRaw(message.messageId.publisherId),
                payload,
                message.signature
            )
            return isValid ? { type: 'valid' } : { type: 'invalid' }
        }
        return { type: 'error', message: `Unsupported signatureType: "${message.signatureType}"` }
    } catch (err) {
        return { type: 'error', message: String(err) }
    }
}

