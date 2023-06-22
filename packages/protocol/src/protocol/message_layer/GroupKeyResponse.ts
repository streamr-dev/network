import { validateIsArray, validateIsString } from '../../utils/validations'
import ValidationError from '../../errors/ValidationError'

import StreamMessage, { StreamMessageType } from './StreamMessage'
import GroupKeyMessage from './GroupKeyMessage'
import EncryptedGroupKey from './EncryptedGroupKey'
/** @internal */
import { EncryptedGroupKeySerialized } from './EncryptedGroupKey'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'

interface Options {
    requestId: string
    recipient: EthereumAddress
    encryptedGroupKeys: EncryptedGroupKey[]
}

export type GroupKeyResponseSerialized = [
    string, string, 
    /** @internal */
    EncryptedGroupKeySerialized[]
]

export default class GroupKeyResponse extends GroupKeyMessage {

    requestId: string
    encryptedGroupKeys: EncryptedGroupKey[]

    constructor({ requestId, recipient, encryptedGroupKeys }: Options) {
        super(recipient, StreamMessageType.GROUP_KEY_RESPONSE)

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
            recipient: toEthereumAddress(recipient),
            encryptedGroupKeys: encryptedGroupKeys.map((it) => EncryptedGroupKey.fromArray(it)),
        })
    }

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage<GroupKeyResponseSerialized> {
        return streamMessage.messageType === StreamMessageType.GROUP_KEY_RESPONSE
    }
}

GroupKeyMessage.classByMessageType[StreamMessageType.GROUP_KEY_RESPONSE] = GroupKeyResponse
