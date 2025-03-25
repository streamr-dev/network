import { UserID } from '@streamr/utils'
import { StreamMessage, StreamMessageType } from './StreamMessage'

interface Options {
    requestId: string
    recipient: UserID
    publicKey: string
    groupKeyIds: string[]
}

export class GroupKeyRequest {
    readonly requestId: string
    readonly recipient: UserID
    readonly publicKey: string
    readonly groupKeyIds: readonly string[]

    constructor({ requestId, recipient, publicKey, groupKeyIds }: Options) {
        this.requestId = requestId
        this.recipient = recipient
        this.publicKey = publicKey
        this.groupKeyIds = groupKeyIds
    }

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage {
        return streamMessage.messageType === StreamMessageType.GROUP_KEY_REQUEST
    }
}
