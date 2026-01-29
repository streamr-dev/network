/**
 * Core signing logic - shared between worker and main thread implementations.
 * This file contains pure cryptographic signing functions without any network dependencies.
 */
import { SigningUtil } from '@streamr/utils'
import { EncryptedGroupKey, SignatureType } from '@streamr/trackerless-network'
import { IDENTITY_MAPPING } from '../identity/IdentityMapping'
import { createSignaturePayload, MessageIdLike, MessageRefLike } from './createSignaturePayload'
import { StreamMessageType } from '../protocol/StreamMessage'

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
 * Plain data type for message content that needs to be signed.
 * This contains only primitive values and simple objects (no class instances).
 */
export interface SignaturePayloadData {
    messageId: MessageIdLike
    prevMsgRef?: MessageRefLike
    messageType: StreamMessageType
    content: Uint8Array
    newGroupKey?: EncryptedGroupKey
}

/**
 * Complete signing request including private key and signature type.
 */
export interface SigningRequest {
    payloadData: SignaturePayloadData
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
        
        const payload = createSignaturePayload({
            messageId: request.payloadData.messageId,
            content: request.payloadData.content,
            messageType: request.payloadData.messageType,
            prevMsgRef: request.payloadData.prevMsgRef,
            newGroupKey: request.payloadData.newGroupKey,
        })
        
        const signature = await signingUtil.createSignature(payload, request.privateKey)
        return { type: 'success', signature }
    } catch (err) {
        return { type: 'error', message: String(err) }
    }
}

/**
 * Extract plain serializable payload data from message options for worker communication.
 */
export function toSignaturePayloadData(opts: {
    messageId: MessageIdLike
    prevMsgRef?: MessageRefLike
    messageType: StreamMessageType
    content: Uint8Array
    newGroupKey?: EncryptedGroupKey
}): SignaturePayloadData {
    return {
        messageId: {
            streamId: opts.messageId.streamId,
            streamPartition: opts.messageId.streamPartition,
            timestamp: opts.messageId.timestamp,
            sequenceNumber: opts.messageId.sequenceNumber,
            publisherId: opts.messageId.publisherId,
            msgChainId: opts.messageId.msgChainId,
        },
        prevMsgRef: opts.prevMsgRef ? {
            timestamp: opts.prevMsgRef.timestamp,
            sequenceNumber: opts.prevMsgRef.sequenceNumber,
        } : undefined,
        messageType: opts.messageType,
        content: opts.content,
        newGroupKey: opts.newGroupKey,
    }
}
