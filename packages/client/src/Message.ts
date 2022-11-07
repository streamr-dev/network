import { EthereumAddress } from '@streamr/utils'
import { StreamID, StreamMessage } from '@streamr/protocol'

export interface Message {
    content: unknown
    streamId: StreamID
    streamPartition: number
    timestamp: number
    sequenceNumber: number
    signature: string
    publisherId: EthereumAddress
    msgChainId: string
    /** @internal */
    streamMessage: StreamMessage // TODO remove this field if possible
}

export type MessageMetadata = Omit<Message, 'content'>

export const convertStreamMessageToMessage = (msg: StreamMessage<any>): Message => {
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
