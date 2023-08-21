import { GroupKeyRequest as OldGroupKeyRequest } from '@streamr/protocol'
import { GroupKeyRequest } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { EthereumAddress } from '@streamr/utils'
import { BinaryTranslator } from '../../utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyRequestTranslator {

    static toProtobuf(msg: OldGroupKeyRequest): GroupKeyRequest {
        const translated: GroupKeyRequest = {
            recipient: BinaryTranslator.toBinary(msg.recipient),
            requestId: msg.requestId,
            rsaPublicKey: BinaryTranslator.toBinary(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyRequest): OldGroupKeyRequest {
        const translated = new OldGroupKeyRequest({
            recipient: BinaryTranslator.toUTF8(msg.recipient) as EthereumAddress,
            requestId: msg.requestId,
            rsaPublicKey: BinaryTranslator.toUTF8(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        })
        return translated
    }

}
