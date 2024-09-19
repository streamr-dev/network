import { EncryptedGroupKey } from './EncryptedGroupKey'
import { StreamMessage, StreamMessageType } from './StreamMessage'
import { ValidationError } from './ValidationError'

interface Options {
    requestId: string
    recipient: Uint8Array  // TODO UserID
    encryptedGroupKeys: EncryptedGroupKey[]
}

export class GroupKeyResponse {
    readonly requestId: string
    readonly recipient: Uint8Array  // TODO UserID
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
