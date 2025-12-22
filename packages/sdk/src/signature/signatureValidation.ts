/**
 * Core signature validation logic - shared between worker and main thread implementations.
 * This file contains pure cryptographic validation functions without any network dependencies.
 */
import { SigningUtil, toUserIdRaw } from '@streamr/utils'
import { EncryptedGroupKey, EncryptionType, SignatureType } from '@streamr/trackerless-network'
import { IDENTITY_MAPPING } from '../identity/IdentityMapping'
import { createSignaturePayload, MessageIdLike, MessageRefLike } from './createSignaturePayload'
import { createLegacySignaturePayload } from './createLegacySignaturePayload'
import { StreamMessage, StreamMessageType } from '../protocol/StreamMessage'

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
    | { type: 'error', message: string }

/**
 * Plain data type for signature validation that can be serialized to a worker.
 * This contains only primitive values and simple objects (no class instances).
 */
export interface SignatureValidationData {
    messageId: MessageIdLike
    prevMsgRef?: MessageRefLike
    messageType: StreamMessageType
    content: Uint8Array
    signature: Uint8Array
    signatureType: SignatureType
    encryptionType: EncryptionType
    newGroupKey?: EncryptedGroupKey
}

/**
 * Extract plain serializable data from a StreamMessage for worker communication.
 */
export function toSignatureValidationData(message: StreamMessage): SignatureValidationData {
    return {
        messageId: {
            streamId: message.messageId.streamId,
            streamPartition: message.messageId.streamPartition,
            timestamp: message.messageId.timestamp,
            sequenceNumber: message.messageId.sequenceNumber,
            publisherId: message.messageId.publisherId,
            msgChainId: message.messageId.msgChainId,
        },
        prevMsgRef: message.prevMsgRef ? {
            timestamp: message.prevMsgRef.timestamp,
            sequenceNumber: message.prevMsgRef.sequenceNumber,
        } : undefined,
        messageType: message.messageType,
        content: message.content,
        signature: message.signature,
        signatureType: message.signatureType,
        encryptionType: message.encryptionType,
        newGroupKey: message.newGroupKey,
    }
}

/**
 * Validate signature using extracted data.
 * This is the core validation logic that can be run in a worker.
 */
export async function validateSignatureData(data: SignatureValidationData): Promise<SignatureValidationResult> {
    try {
        const signingUtil = signingUtilBySignatureType[data.signatureType]
        // Common case: standard signature types
        if (signingUtil) {
            const payload = createSignaturePayload({
                messageId: data.messageId,
                content: data.content,
                messageType: data.messageType,
                prevMsgRef: data.prevMsgRef,
                newGroupKey: data.newGroupKey,
            })
            const isValid = await signingUtil.verifySignature(
                toUserIdRaw(data.messageId.publisherId),
                payload,
                data.signature
            )
            return isValid ? { type: 'valid' } : { type: 'invalid' }
        }
        // Special handling: legacy signature type
        if (data.signatureType === SignatureType.ECDSA_SECP256K1_LEGACY) {
            const payload = createLegacySignaturePayload({
                messageId: data.messageId,
                content: data.content,
                encryptionType: data.encryptionType,
                prevMsgRef: data.prevMsgRef,
                newGroupKey: data.newGroupKey,
            })
            const isValid = await evmSigner.verifySignature(
                toUserIdRaw(data.messageId.publisherId),
                payload,
                data.signature
            )
            return isValid ? { type: 'valid' } : { type: 'invalid' }
        }
        return { type: 'error', message: `Unsupported signatureType: "${data.signatureType}"` }
    } catch (err) {
        return { type: 'error', message: String(err) }
    }
}

