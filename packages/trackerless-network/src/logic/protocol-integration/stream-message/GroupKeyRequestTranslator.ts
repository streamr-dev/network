import { GroupKeyRequest as OldGroupKeyRequest } from 'streamr-client-protocol'
import { GroupKeyRequest } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { EthereumAddress } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyRequestTranslator {

    static toProtobuf(msg: OldGroupKeyRequest): GroupKeyRequest {
        const translated: GroupKeyRequest = {
            recipient: msg.recipient,
            requestId: msg.requestId,
            rsaPublicKey: msg.rsaPublicKey,
            groupKeyIds: msg.groupKeyIds
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyRequest): OldGroupKeyRequest {
        const translated = new OldGroupKeyRequest({
            recipient: msg.recipient as EthereumAddress,
            requestId: msg.requestId,
            rsaPublicKey: msg.rsaPublicKey,
            groupKeyIds: msg.groupKeyIds
        })
        return translated
    }

}
