import { validateIsArray } from '../../utils/validations'
import ValidationError from '../../errors/ValidationError'

import StreamMessage, { StreamMessageType } from './StreamMessage'
import EncryptedGroupKey from './EncryptedGroupKey'
import { EthereumAddress } from '@streamr/utils'

interface Options {
    requestId: string
    recipient: EthereumAddress
    encryptedGroupKeys: EncryptedGroupKey[]
}

export default class GroupKeyResponse {
    readonly requestId: string
    readonly recipient: EthereumAddress
    readonly encryptedGroupKeys: ReadonlyArray<EncryptedGroupKey>

    constructor({ requestId, recipient, encryptedGroupKeys }: Options) {
        this.requestId = requestId
        this.recipient = recipient
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
