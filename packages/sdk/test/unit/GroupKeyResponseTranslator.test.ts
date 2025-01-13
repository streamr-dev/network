import { GroupKey, GroupKeyResponse } from '@streamr/trackerless-network'
import { hexToBinary, toUserIdRaw } from '@streamr/utils'
import { EncryptedGroupKey as OldEncryptedGroupKey } from '../../src/protocol/EncryptedGroupKey'
import { GroupKeyResponse as OldGroupKeyResponse } from '../../src/protocol/GroupKeyResponse'
import { GroupKeyResponseTranslator } from '../../src/protocol/GroupKeyResponseTranslator'
import { randomUserId } from '@streamr/test-utils'

const RECIPIENT = randomUserId()

describe('GroupKeyResponseTranslator', () => {
    const oldGroupKeyResponse = new OldGroupKeyResponse({
        requestId: 'request',
        recipient: RECIPIENT,
        encryptedGroupKeys: [new OldEncryptedGroupKey('id', hexToBinary('0000'))]
    })
    const newGroupKey: GroupKey = {
        id: 'id',
        data: hexToBinary('0000')
    }
    const newGroupKeyResponse: GroupKeyResponse = {
        requestId: 'request',
        recipientId: toUserIdRaw(RECIPIENT),
        groupKeys: [newGroupKey]
    }

    it('translates old protocol to protobuf', () => {
        const translated = GroupKeyResponseTranslator.toProtobuf(oldGroupKeyResponse)
        expect(translated.groupKeys).toEqual(newGroupKeyResponse.groupKeys)
        expect(translated.recipientId).toEqual(newGroupKeyResponse.recipientId)
        expect(translated.requestId).toEqual(newGroupKeyResponse.requestId)
    })

    it('translates protobuf to old protocol', () => {
        const translated = GroupKeyResponseTranslator.toClientProtocol(newGroupKeyResponse)
        expect(translated.encryptedGroupKeys).toEqual(oldGroupKeyResponse.encryptedGroupKeys)
        expect(translated.recipient).toEqual(oldGroupKeyResponse.recipient)
        expect(translated.requestId).toEqual(oldGroupKeyResponse.requestId)
    })
})
