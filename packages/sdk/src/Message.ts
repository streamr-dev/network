import { HexString, StreamID, KeyType } from '@streamr/utils'
import { StreamMessage } from './protocol/StreamMessage'
import { SignatureType } from '@streamr/trackerless-network'
import { IDENTITY_MAPPING } from './identity/IdentityMapping'

// Lookup structure for converting SignatureType to KeyType string
export type MessageSignatureType = KeyType | 'ECDSA_SECP256K1_LEGACY' | 'ERC_1271'
const stringVersionsOfSignatureTypes: Record<number, MessageSignatureType> = {
    // Read key pair SignatureTypes from IdentityMapping
    ...Object.fromEntries(
        IDENTITY_MAPPING.map(
            (idMapping) => [idMapping.signatureType, idMapping.keyType]
        )
    ),
    // These special ones need to be added manually
    [SignatureType.ECDSA_SECP256K1_LEGACY]: 'ECDSA_SECP256K1_LEGACY',
    [SignatureType.ERC_1271]: 'ERC_1271',
}

/**
 * Represents a message in the Streamr Network.
 *
 * @category Important
 */
export interface Message {
    /**
     * The message contents / payload. Given as JSON or Uint8Array
     */
    content: unknown

    /**
     * Identifies the stream the message was published to.
     */
    streamId: StreamID

    /**
     * The partition number the message was published to.
     */
    streamPartition: number

    /**
     * The timestamp of when the message was published.
     */
    timestamp: number

    /**
     * Tiebreaker used to determine order in the case of multiple messages within a message chain having the same exact timestamp.
     */
    sequenceNumber: number

    /**
     * Signature of message signed by publisher.
     */
    signature: Uint8Array

    /**
     * Signature method used to sign message.
     */
    signatureType: MessageSignatureType

    /**
     * Publisher of message.
     */
    publisherId: HexString

    /**
     * Identifies the message chain the message was published to.
     */
    msgChainId: string

    /**
     * Identifiers group key used to encrypt the message.
     */
    encryptionKeyId: string | undefined

    /** @internal */
    streamMessage: StreamMessage // TODO remove this field if possible
}

export type MessageMetadata = Omit<Message, 'content'>

function signatureTypeToString(signatureType: SignatureType): MessageSignatureType {
    const result = stringVersionsOfSignatureTypes[signatureType]
    if (!result) {
        throw new Error(`Unknown signature type: ${signatureType}`)
    }
    return result
}

export const convertStreamMessageToMessage = (msg: StreamMessage): Message => {
    return {
        content: msg.getParsedContent(),
        streamId: msg.getStreamId(),
        streamPartition: msg.getStreamPartition(),
        timestamp: msg.getTimestamp(),
        sequenceNumber: msg.getSequenceNumber(),
        signature: msg.signature,
        signatureType: signatureTypeToString(msg.signatureType),
        publisherId: msg.getPublisherId(),
        msgChainId: msg.getMsgChainId(),
        encryptionKeyId: msg.groupKeyId,
        streamMessage: msg
        // TODO add other relevant fields (could update some test assertions to
        // use those keys instead of getting the fields via from streamMessage property)
    }
}
