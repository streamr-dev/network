import { GroupKeyResponse as OldGroupKeyResponse, EncryptedGroupKey as OldEncryptedGroupKey } from '@streamr/protocol'
import { GroupKey, GroupKeyResponse } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { toEthereumAddress, binaryToHex, hexToBinary } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyResponseTranslator {

    static toProtobuf(msg: OldGroupKeyResponse): GroupKeyResponse {

        const groupKeys = msg.encryptedGroupKeys.map((groupKey) => {
            return {
                data: groupKey.data,
                id: groupKey.id
            }
        })
        const translated: GroupKeyResponse = {
            recipientId: hexToBinary(msg.recipient),
            requestId: msg.requestId,
            groupKeys
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyResponse): OldGroupKeyResponse {
        const encryptedGroupKeys = msg.groupKeys.map((groupKey: GroupKey) => new OldEncryptedGroupKey(
            groupKey.id,
            groupKey.data,
        ))
        return new OldGroupKeyResponse({
            requestId: msg.requestId,
            recipient: toEthereumAddress(binaryToHex(msg.recipientId, true)),
            encryptedGroupKeys
        })
    }
}
