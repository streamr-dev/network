import { GroupKeyRequest as OldGroupKeyRequest } from '@streamr/protocol'
import { GroupKeyRequest } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { toEthereumAddress } from '@streamr/utils'
import { toBinary, toUTF8 } from '../../utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyRequestTranslator {

    static toProtobuf(msg: OldGroupKeyRequest): GroupKeyRequest {
        const translated: GroupKeyRequest = {
            recipient: toBinary(msg.recipient),
            requestId: msg.requestId,
            rsaPublicKey: toBinary(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyRequest): OldGroupKeyRequest {
        const translated = new OldGroupKeyRequest({
            recipient: toEthereumAddress(toUTF8(msg.recipient)),
            requestId: msg.requestId,
            rsaPublicKey: toUTF8(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        })
        return translated
    }

}
