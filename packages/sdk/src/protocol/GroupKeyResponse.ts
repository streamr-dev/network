import { UserID } from '@streamr/utils'
import { EncryptedGroupKey } from './EncryptedGroupKey'
import { StreamMessage, StreamMessageType } from './StreamMessage'
import { ValidationError } from './ValidationError'

interface Options {
    requestId: string
    recipient: UserID
    encryptedGroupKeys: EncryptedGroupKey[]
}

export class GroupKeyResponse {
    readonly requestId: string
    readonly recipient: UserID
    readonly encryptedGroupKeys: readonly EncryptedGroupKey[]

    constructor({ requestId, recipient, encryptedGroupKeys }: Options) {
        this.requestId = requestId
        this.recipient = recipient
        this.encryptedGroupKeys = encryptedGroupKeys
        // Validate content of encryptedGroupKeys
        this.encryptedGroupKeys.forEach((it: EncryptedGroupKey) => {
            if (!(it instanceof EncryptedGroupKey)) {
                throw new ValidationError(
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    `Expected 'encryptedGroupKeys' to be a list of EncryptedGroupKey instances! Was: ${this.encryptedGroupKeys}`
                )
            }
        })
    }

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage {
        return streamMessage.messageType === StreamMessageType.GROUP_KEY_RESPONSE
    }
}
