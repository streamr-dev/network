import { UserID } from '@streamr/utils'
import { StreamMessage, StreamMessageType } from './StreamMessage'
import { AsymmetricEncryptionType } from '@streamr/trackerless-network/dist/generated/packages/trackerless-network/protos/NetworkRpc'

interface Options {
    requestId: string
    recipient: UserID
    publicKey: Uint8Array
    groupKeyIds: string[]
    encryptionType: AsymmetricEncryptionType
}

export class GroupKeyRequest {
    readonly requestId: string
    readonly recipient: UserID
    readonly publicKey: Uint8Array
    readonly groupKeyIds: readonly string[]
    readonly encryptionType: AsymmetricEncryptionType

    constructor({ requestId, recipient, publicKey, groupKeyIds, encryptionType }: Options) {
        this.requestId = requestId
        this.recipient = recipient
        this.publicKey = publicKey
        this.groupKeyIds = groupKeyIds
        this.encryptionType = encryptionType
    }

    static is(streamMessage: StreamMessage): streamMessage is StreamMessage {
        return streamMessage.messageType === StreamMessageType.GROUP_KEY_REQUEST
    }
}
