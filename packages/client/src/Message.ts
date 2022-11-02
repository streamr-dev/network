import { EthereumAddress } from '@streamr/utils'
import { StreamMessage } from 'streamr-client-protocol'

export interface Message {
    content: unknown
    signature: string
    publisherId: EthereumAddress
}

export const convertStreamMessageToMessage = (msg: StreamMessage<any>): Message => {
    return {
        content: msg.getParsedContent(),
        signature: msg.signature,
        publisherId: msg.getPublisherId()
        // TODO add other relevant fields
    }
}
