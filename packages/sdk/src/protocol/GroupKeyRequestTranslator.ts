import { GroupKeyRequest as NewGroupKeyRequest } from '@streamr/trackerless-network'
import { binaryToUtf8, toUserId, toUserIdRaw, utf8ToBinary } from '@streamr/utils'
import { GroupKeyRequest as OldGroupKeyRequest } from './GroupKeyRequest'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyRequestTranslator {
    static toProtobuf(msg: OldGroupKeyRequest): NewGroupKeyRequest {
        const translated: NewGroupKeyRequest = {
            recipientId: toUserIdRaw(msg.recipient),
            requestId: msg.requestId,
            rsaPublicKey: utf8ToBinary(msg.rsaPublicKey),
            groupKeyIds: [...msg.groupKeyIds]
        }
        return translated
    }

    static toClientProtocol(msg: NewGroupKeyRequest): OldGroupKeyRequest {
        const translated = new OldGroupKeyRequest({
            recipient: toUserId(msg.recipientId),
            requestId: msg.requestId,
            rsaPublicKey: binaryToUtf8(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        })
        return translated
    }
}
