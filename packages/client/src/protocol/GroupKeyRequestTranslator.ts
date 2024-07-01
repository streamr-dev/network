import { GroupKeyRequest as OldGroupKeyRequest } from '@streamr/protocol'
import { GroupKeyRequest as NewGroupKeyRequest } from '@streamr/trackerless-network'
import { toEthereumAddress, binaryToHex, binaryToUtf8, hexToBinary, utf8ToBinary } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyRequestTranslator {

    static toProtobuf(msg: OldGroupKeyRequest): NewGroupKeyRequest {
        const translated: NewGroupKeyRequest = {
            recipientId: hexToBinary(msg.recipient),
            requestId: msg.requestId,
            rsaPublicKey: utf8ToBinary(msg.rsaPublicKey),
            groupKeyIds: [...msg.groupKeyIds]
        }
        return translated
    }

    static toClientProtocol(msg: NewGroupKeyRequest): OldGroupKeyRequest {
        const translated = new OldGroupKeyRequest({
            recipient: toEthereumAddress(binaryToHex(msg.recipientId, true)),
            requestId: msg.requestId,
            rsaPublicKey: binaryToUtf8(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        })
        return translated
    }

}
