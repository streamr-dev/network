import { StreamID, toUserIdOld, UserIDOld } from '@streamr/utils'
import { SignatureType, StreamMessage } from './protocol/StreamMessage'

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
    signatureType: 'LEGACY_SECP256K1' | 'SECP256K1' | 'ERC_1271'

    /**
     * Publisher of message.
     */
    publisherId: UserIDOld

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

function signatureTypeToString(signatureType: SignatureType): 'LEGACY_SECP256K1' | 'SECP256K1' | 'ERC_1271' {
    switch (signatureType) {
        case SignatureType.LEGACY_SECP256K1:
            return 'LEGACY_SECP256K1'
        case SignatureType.SECP256K1:
            return 'SECP256K1'
        case SignatureType.ERC_1271:
            return 'ERC_1271'
        default:
            throw new Error(`Unknown signature type: ${signatureType}`)
    }
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
        publisherId: toUserIdOld(msg.getPublisherId()),
        msgChainId: msg.getMsgChainId(),
        groupKeyId: msg.groupKeyId,
        streamMessage: msg
        // TODO add other relevant fields (could update some test assertions to
        // use those keys instead of getting the fields via from streamMessage property)
    }
}
