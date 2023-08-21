import { GroupKeyResponse as OldGroupKeyResponse, EncryptedGroupKey as OldEncryptedGroupKey } from '@streamr/protocol'
import { EncryptedGroupKey, GroupKeyResponse } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { EthereumAddress } from '@streamr/utils'
import { BinaryTranslator } from '../../utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyResponseTranslator {

    static toProtobuf(msg: OldGroupKeyResponse): GroupKeyResponse {

        const groupKeys = msg.encryptedGroupKeys.map((groupKey) => {
            const encryptedGroupKey: EncryptedGroupKey = {
                data: BinaryTranslator.toBinary(groupKey.encryptedGroupKeyHex),
                groupKeyId: groupKey.groupKeyId
            }
            return encryptedGroupKey
        })
        const translated: GroupKeyResponse = {
            recipient: BinaryTranslator.toBinary(msg.recipient),
            requestId: msg.requestId,
            groupKeys
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyResponse): OldGroupKeyResponse {
        const encryptedGroupKeys = msg.groupKeys.map((groupKey: EncryptedGroupKey) => new OldEncryptedGroupKey(
            groupKey.groupKeyId,
            BinaryTranslator.toUTF8(groupKey.data),
        ))
        return new OldGroupKeyResponse({
            requestId: msg.requestId,
            recipient: BinaryTranslator.toUTF8(msg.recipient) as EthereumAddress,
            encryptedGroupKeys
        })
    }
}
