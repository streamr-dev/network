import { validateIsArray, validateIsString } from '../../utils/validations'
import ValidationError from '../../errors/ValidationError'

import StreamMessage from './StreamMessage'
import GroupKeyMessage from './GroupKeyMessage'
import EncryptedGroupKey, { EncryptedGroupKeySerialized } from './EncryptedGroupKey'
import { EthereumAddress } from '../../utils'

interface Options {
    requestId: string
    recipient: EthereumAddress
    encryptedGroupKeys: EncryptedGroupKey[]
}

export type GroupKeyResponseSerialized = [string, string, EncryptedGroupKeySerialized[]]

export default class GroupKeyResponse extends GroupKeyMessage {

    requestId: string
    encryptedGroupKeys: EncryptedGroupKey[]

    constructor({ requestId, recipient, encryptedGroupKeys }: Options) {
        super(recipient, StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE)

        validateIsString('requestId', requestId)
        this.requestId = requestId

        validateIsArray('encryptedGroupKeys', encryptedGroupKeys)
        this.encryptedGroupKeys = encryptedGroupKeys

        // Validate content of encryptedGroupKeys
        this.encryptedGroupKeys.forEach((it: EncryptedGroupKey) => {
            if (!(it instanceof EncryptedGroupKey)) {
                throw new ValidationError(
                    `Expected 'encryptedGroupKeys' to be a list of EncryptedGroupKey instances! Was: ${this.encryptedGroupKeys}`
                )
            }
        })
    }

    toArray(): GroupKeyResponseSerialized {
        return [this.requestId, this.recipient, this.encryptedGroupKeys.map((it: EncryptedGroupKey) => it.toArray())]
    }

    static override fromArray(arr: GroupKeyResponseSerialized): GroupKeyResponse {
        const [requestId, recipient, encryptedGroupKeys] = arr
        return new GroupKeyResponse({
            requestId,
            recipient,
            encryptedGroupKeys: encryptedGroupKeys.map((it) => EncryptedGroupKey.fromArray(it)),
        })
    }

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage<GroupKeyResponseSerialized> {
        return streamMessage.messageType === StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE
    }
}

GroupKeyMessage.classByMessageType[StreamMessage.MESSAGE_TYPES.GROUP_KEY_RESPONSE] = GroupKeyResponse
