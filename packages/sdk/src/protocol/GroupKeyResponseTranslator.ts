import { GroupKey as NewGroupKey, GroupKeyResponse as NewGroupKeyResponse } from '@streamr/trackerless-network'
import { toUserId, toUserIdRaw } from '@streamr/utils'
import { EncryptedGroupKey as OldEncryptedGroupKey } from './EncryptedGroupKey'
import { GroupKeyResponse as OldGroupKeyResponse } from './GroupKeyResponse'

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
            recipientId: toUserIdRaw(msg.recipient),
            requestId: msg.requestId,
            groupKeys
        }
        return translated
    }

    static toClientProtocol(msg: NewGroupKeyResponse): OldGroupKeyResponse {
        const encryptedGroupKeys = msg.groupKeys.map(
            (groupKey: NewGroupKey) => new OldEncryptedGroupKey(groupKey.id, groupKey.data)
        )
        return new OldGroupKeyResponse({
            requestId: msg.requestId,
            recipient: toUserId(msg.recipientId),
            encryptedGroupKeys
        })
    }
}
