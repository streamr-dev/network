import { GroupKeyRequest as OldGroupKeyRequest } from '@streamr/protocol'
import { GroupKeyRequest } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { EthereumAddress } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyRequestTranslator {

    private static readonly textEncoder = new TextEncoder() 
    private static readonly textDecoder = new TextDecoder()

    static toProtobuf(msg: OldGroupKeyRequest): GroupKeyRequest {
        const translated: GroupKeyRequest = {
            recipient: this.textEncoder.encode(msg.recipient),
            requestId: msg.requestId,
            rsaPublicKey: this.textEncoder.encode(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyRequest): OldGroupKeyRequest {
        const translated = new OldGroupKeyRequest({
            recipient: this.textDecoder.decode(msg.recipient) as EthereumAddress,
            requestId: msg.requestId,
            rsaPublicKey: this.textDecoder.decode(msg.rsaPublicKey),
            groupKeyIds: msg.groupKeyIds
        })
        return translated
    }

}
