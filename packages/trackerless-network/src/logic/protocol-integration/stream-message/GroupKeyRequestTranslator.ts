import { GroupKeyRequest as OldGroupKeyRequest } from '@streamr/protocol'
import { GroupKeyRequest } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { binaryToUtf8, utf8ToBinary } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyRequestTranslator {

    static toProtobuf(msg: OldGroupKeyRequest): GroupKeyRequest {
        const translated: GroupKeyRequest = {
            recipientId: msg.recipient,
            requestId: msg.requestId,
            rsaPublicKey: utf8ToBinary(msg.rsaPublicKey),
            groupKeyIds: [...msg.groupKeyIds]
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyRequest): OldGroupKeyRequest {
        const translated = new OldGroupKeyRequest({
            recipient: msg.recipientId,
            requestId: msg.requestId,
            rsaPublicKey: binaryToUtf8(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        })
        return translated
    }

}
