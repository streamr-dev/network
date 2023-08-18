import { GroupKeyResponse as OldGroupKeyResponse, EncryptedGroupKey as OldEncryptedGroupKey } from '@streamr/protocol'
import { EncryptedGroupKey, GroupKeyResponse } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { EthereumAddress } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyResponseTranslator {

    private static readonly textEncoder = new TextEncoder() 
    private static readonly textDecoder = new TextDecoder()

    static toProtobuf(msg: OldGroupKeyResponse): GroupKeyResponse {

        const groupKeys = msg.encryptedGroupKeys.map((groupKey) => {
            const encryptedGroupKey: EncryptedGroupKey = {
                data: this.textEncoder.encode(groupKey.encryptedGroupKeyHex),
                groupKeyId: groupKey.groupKeyId
            }
            return encryptedGroupKey
        })
        const translated: GroupKeyResponse = {
            recipient: this.textEncoder.encode(msg.recipient),
            requestId: msg.requestId,
            groupKeys
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyResponse): OldGroupKeyResponse {
        const encryptedGroupKeys = msg.groupKeys.map((groupKey: EncryptedGroupKey) => new OldEncryptedGroupKey(
            groupKey.groupKeyId,
            this.textDecoder.decode(groupKey.data),
        ))
        return new OldGroupKeyResponse({
            requestId: msg.requestId,
            recipient: this.textDecoder.decode(msg.recipient) as EthereumAddress,
            encryptedGroupKeys
        })
    }
}
