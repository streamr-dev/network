import { GroupKeyResponse as OldGroupKeyResponse, EncryptedGroupKey as OldEncryptedGroupKey } from 'streamr-client-protocol'
import { EncryptedGroupKey, GroupKeyResponse } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { EthereumAddress } from '@streamr/utils'

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class GroupKeyResponseTranslator {

    static toProtobuf(msg: OldGroupKeyResponse): GroupKeyResponse {

        const encryptedGroupKeys = msg.encryptedGroupKeys.map((groupKey) => {
            const encryptedGroupKey: EncryptedGroupKey = {
                encryptedGroupKeyHex: groupKey.encryptedGroupKeyHex,
                groupKeyId: groupKey.groupKeyId,
                serialized: groupKey.serialized || undefined
            }
            return encryptedGroupKey
        })
        const translated: GroupKeyResponse = {
            recipient: msg.recipient as string,
            requestId: msg.requestId,
            encryptedGroupKeys
        }
        return translated
    }

    static toClientProtocol(msg: GroupKeyResponse): OldGroupKeyResponse {
        const encryptedGroupKeys = msg.encryptedGroupKeys.map((groupKey: EncryptedGroupKey) => new OldEncryptedGroupKey(
            groupKey.groupKeyId,
            groupKey.encryptedGroupKeyHex,
            groupKey.serialized
        ))
        return new OldGroupKeyResponse({
            requestId: msg.requestId,
            recipient: msg.recipient as EthereumAddress,
            encryptedGroupKeys
        })
    }
}
