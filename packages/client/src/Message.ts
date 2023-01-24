import { EthereumAddress } from '@streamr/utils'
import { StreamID, StreamMessage } from '@streamr/protocol'

/**
 * Represents a message in the Streamr Network.
 *
 * @category Important
 */
export interface Message {
    /**
     * The message contents / payload.
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
    signature: string

    /**
     * Publisher of message.
     */
    publisherId: EthereumAddress

    /**
     * Identifies the message chain the message was published to.
     */
    msgChainId: string

    /** @internal */
    streamMessage: StreamMessage // TODO remove this field if possible
}

export type MessageMetadata = Omit<Message, 'content'>

export const convertStreamMessageToMessage = (msg: StreamMessage): Message => {
    return {
        content: msg.getParsedContent(),
        streamId: msg.getStreamId(),
        streamPartition: msg.getStreamPartition(),
        timestamp: msg.getTimestamp(),
        sequenceNumber: msg.getSequenceNumber(),
        signature: msg.signature,
        publisherId: msg.getPublisherId(),
        msgChainId: msg.getMsgChainId(),
        streamMessage: msg
        // TODO add other relevant fields (could update some test assertions to
        // use those keys instead of getting the fields via from streamMessage property)
    }
}
