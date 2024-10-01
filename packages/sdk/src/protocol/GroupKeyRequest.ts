import { UserIDOld } from '@streamr/utils'
import { StreamMessage, StreamMessageType } from './StreamMessage'

interface Options {
    requestId: string
    recipient: UserIDOld
    rsaPublicKey: string
    groupKeyIds: string[]
}

export class GroupKeyRequest {
    readonly requestId: string
    readonly recipient: UserIDOld
    readonly rsaPublicKey: string
    readonly groupKeyIds: ReadonlyArray<string>

    constructor({ requestId, recipient, rsaPublicKey, groupKeyIds }: Options) {
        this.requestId = requestId
        this.recipient = recipient
        this.rsaPublicKey = rsaPublicKey
        this.groupKeyIds = groupKeyIds
    }

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage {
        return streamMessage.messageType === StreamMessageType.GROUP_KEY_REQUEST
    }
}
