import { GroupKeyResponseTranslator } from '../../src/logic/protocol-integration/stream-message/GroupKeyResponseTranslator'
import {
    GroupKeyResponse as OldGroupKeyResponse,
    EncryptedGroupKey as OldEncryptedGroupKey
} from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { GroupKey, GroupKeyResponse } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { hexToBinary } from '../../src/logic/utils'

describe('GroupKeyResponseTranslator', () => {

    const oldGroupKeyResponse = new OldGroupKeyResponse({
        requestId: 'request',
        recipient: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as EthereumAddress,
        encryptedGroupKeys: [ new OldEncryptedGroupKey('id', '0000') ]
    })
    const newGroupKey: GroupKey = {
        id: 'id',
        data: hexToBinary('0000')
    }
    const newGroupKeyResponse: GroupKeyResponse = {
        requestId: 'request',
        recipientId: hexToBinary('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
        groupKeys: [ newGroupKey ]
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
