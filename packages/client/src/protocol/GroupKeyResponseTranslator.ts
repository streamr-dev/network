import { GroupKeyResponse as OldGroupKeyResponse, EncryptedGroupKey as OldEncryptedGroupKey } from '@streamr/protocol'
import { GroupKey as NewGroupKey, GroupKeyResponse as NewGroupKeyResponse } from '@streamr/trackerless-network'
import { toEthereumAddress, binaryToHex, hexToBinary } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyResponseTranslator {

    static toProtobuf(msg: OldGroupKeyResponse): NewGroupKeyResponse {
        const groupKeys = msg.encryptedGroupKeys.map((groupKey) => {
            return {
                data: groupKey.data,
                id: groupKey.id
            }
        })
        const translated: NewGroupKeyResponse = {
            recipientId: hexToBinary(msg.recipient),
            requestId: msg.requestId,
            groupKeys
        }
        return translated
    }

    static toClientProtocol(msg: NewGroupKeyResponse): OldGroupKeyResponse {
        const encryptedGroupKeys = msg.groupKeys.map((groupKey: NewGroupKey) => new OldEncryptedGroupKey(
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
