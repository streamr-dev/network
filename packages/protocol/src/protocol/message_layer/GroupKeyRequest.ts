import { validateIsArray, validateIsString } from '../../utils/validations'

import GroupKeyMessage from './GroupKeyMessage'
import StreamMessage from './StreamMessage'

interface Options {
    requestId: string
    streamId: string
    rsaPublicKey: string
    groupKeyIds: string[]
}

export type GroupKeyRequestSerialized = [string, string, string, string[]]

export default class GroupKeyRequest extends GroupKeyMessage {

    requestId: string
    rsaPublicKey: string
    groupKeyIds: string[]

    constructor({ requestId, streamId, rsaPublicKey, groupKeyIds }: Options) {
        super(streamId, StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST)

        validateIsString('requestId', requestId)
        this.requestId = requestId

        validateIsString('rsaPublicKey', rsaPublicKey)
        this.rsaPublicKey = rsaPublicKey

        validateIsArray('groupKeyIds', groupKeyIds)
        this.groupKeyIds = groupKeyIds
    }

    toArray(): GroupKeyRequestSerialized {
        return [this.requestId, this.streamId, this.rsaPublicKey, this.groupKeyIds]
    }

    static fromArray(args: GroupKeyRequestSerialized): GroupKeyRequest {
        const [requestId, streamId, rsaPublicKey, groupKeyIds] = args
        return new GroupKeyRequest({
            requestId,
            streamId,
            rsaPublicKey,
            groupKeyIds,
        })
    }

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage<GroupKeyRequestSerialized> {
        return streamMessage.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST
    }
}

GroupKeyMessage.classByMessageType[StreamMessage.MESSAGE_TYPES.GROUP_KEY_REQUEST] = GroupKeyRequest
