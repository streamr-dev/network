import { validateIsArray, validateIsString } from '../../utils/validations'

import StreamMessage, { StreamMessageType } from './StreamMessage'
import { EthereumAddress } from '@streamr/utils'

interface Options {
    requestId: string
    recipient: EthereumAddress
    rsaPublicKey: string
    groupKeyIds: string[]
}

export default class GroupKeyRequest {
    requestId: string
    recipient: EthereumAddress
    rsaPublicKey: string
    groupKeyIds: string[]

    constructor({ requestId, recipient, rsaPublicKey, groupKeyIds }: Options) {
        validateIsString('requestId', requestId)
        this.requestId = requestId

        validateIsString('recipient', recipient)
        this.recipient = recipient

        validateIsString('rsaPublicKey', rsaPublicKey)
        this.rsaPublicKey = rsaPublicKey

        validateIsArray('groupKeyIds', groupKeyIds)
        this.groupKeyIds = groupKeyIds
    }

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage {
        return streamMessage.messageType === StreamMessageType.GROUP_KEY_REQUEST
    }
}
