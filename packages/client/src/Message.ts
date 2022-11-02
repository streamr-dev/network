import { EthereumAddress } from '@streamr/utils'
import { StreamMessage } from 'streamr-client-protocol'

export interface Message {
    content: unknown
    timestamp: number
    sequenceNumber: number
    signature: string
    publisherId: EthereumAddress
    /** @internal */
    streamMessage: StreamMessage // TODO remove this field if possible
}

export const convertStreamMessageToMessage = (msg: StreamMessage<any>): Message => {
    return {
        content: msg.getParsedContent(),
        timestamp: msg.getTimestamp(),
        sequenceNumber: msg.getSequenceNumber(),
        signature: msg.signature,
        publisherId: msg.getPublisherId(),
        streamMessage: msg
        // TODO add other relevant fields (could update some test assertions to
        // use those keys instead of getting the fields via from streamMessage property)
    }
}
