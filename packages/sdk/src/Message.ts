import { HexString, StreamID } from '@streamr/utils'
import { StreamMessage } from './protocol/StreamMessage'
import { SignatureType } from '@streamr/trackerless-network'

type SignatureTypeString = 'LEGACY_SECP256K1' | 'SECP256K1' | 'ERC_1271' | 'ML-DSA-87'

// Gives compile-time error if all valid SignatureType values are not covered
const signatureTypeStrings: Record<SignatureType, SignatureTypeString> = {
    [SignatureType.LEGACY_EVM_SECP256K1]: 'LEGACY_SECP256K1',
    [SignatureType.EVM_SECP256K1]: 'SECP256K1',
    [SignatureType.ERC_1271]: 'ERC_1271',
    [SignatureType.ML_DSA_87]: 'ML-DSA-87',
}

/**
 * Represents a message in the Streamr Network. This is an application-facing class, whereas StreamMessage is considered internal.
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
    signatureType: SignatureTypeString

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
    groupKeyId: string | undefined

    /** @internal */
    streamMessage: StreamMessage // TODO remove this field if possible
}

export type MessageMetadata = Omit<Message, 'content'>

function signatureTypeToString(signatureType: SignatureType): SignatureTypeString {
    const result = signatureTypeStrings[signatureType]
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
        groupKeyId: msg.groupKeyId,
        streamMessage: msg
        // TODO add other relevant fields (could update some test assertions to
        // use those keys instead of getting the fields via from streamMessage property)
    }
}
