import { validateIsArray, validateIsString } from '../../utils/validations'
import ValidationError from '../../errors/ValidationError'

import StreamMessage, { StreamMessageType } from './StreamMessage'
import GroupKeyMessage from './GroupKeyMessage'
import EncryptedGroupKey from './EncryptedGroupKey'
import { EthereumAddress } from '@streamr/utils'

interface Options {
    requestId: string
    recipient: EthereumAddress
    encryptedGroupKeys: EncryptedGroupKey[]
}

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

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage {
        return streamMessage.messageType === StreamMessageType.GROUP_KEY_RESPONSE
    }
}
