import ValidationError from '../../errors/ValidationError'

import StreamMessage, { StreamMessageType } from './StreamMessage'
import EncryptedGroupKey from './EncryptedGroupKey'

interface Options {
    requestId: string
    recipient: Uint8Array
    encryptedGroupKeys: EncryptedGroupKey[]
}

export default class GroupKeyResponse {
    readonly requestId: string
    readonly recipient: Uint8Array
    readonly encryptedGroupKeys: ReadonlyArray<EncryptedGroupKey>

    constructor({ requestId, recipient, encryptedGroupKeys }: Options) {
        this.requestId = requestId
        this.recipient = recipient
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
