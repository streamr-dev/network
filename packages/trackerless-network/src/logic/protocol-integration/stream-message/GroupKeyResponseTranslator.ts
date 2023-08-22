import { GroupKeyResponse as OldGroupKeyResponse, EncryptedGroupKey as OldEncryptedGroupKey } from '@streamr/protocol'
import { GroupKey, GroupKeyResponse } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { toEthereumAddress } from '@streamr/utils'
import { toBinary, toUTF8 } from '../../utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyResponseTranslator {

    static toProtobuf(msg: OldGroupKeyResponse): GroupKeyResponse {

        const groupKeys = msg.encryptedGroupKeys.map((groupKey) => {
            return {
                data: toBinary(groupKey.encryptedGroupKeyHex),
                id: groupKey.groupKeyId
            }
        })
        const translated: GroupKeyResponse = {
            recipient: toBinary(msg.recipient),
            requestId: msg.requestId,
            groupKeys
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyResponse): OldGroupKeyResponse {
        const encryptedGroupKeys = msg.groupKeys.map((groupKey: GroupKey) => new OldEncryptedGroupKey(
            groupKey.id,
            toUTF8(groupKey.data),
        ))
        return new OldGroupKeyResponse({
            requestId: msg.requestId,
            recipient: toEthereumAddress(toUTF8(msg.recipient)),
            encryptedGroupKeys
        })
    }
}
