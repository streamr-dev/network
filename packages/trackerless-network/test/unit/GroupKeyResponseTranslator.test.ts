import { GroupKeyResponseTranslator } from '../../src/logic/protocol-integration/stream-message/GroupKeyResponseTranslator'
import {
    GroupKeyResponse as OldGroupKeyResponse,
    EncryptedGroupKey as OldEncryptedGroupKey
} from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { EncryptedGroupKey, GroupKeyResponse } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { BinaryTranslator } from '../../src/logic/utils'

describe('GroupKeyResponseTranslator', () => {

    const oldGroupKeyResponse = new OldGroupKeyResponse({
        requestId: 'request',
        recipient: 'recipient' as EthereumAddress,
        encryptedGroupKeys: [ new OldEncryptedGroupKey('id', '0000') ]
    })
    const newEncryptedGroupKey: EncryptedGroupKey = {
        groupKeyId: 'id',
        data: BinaryTranslator.toBinary('0000')
    }
    const newGroupKeyResponse: GroupKeyResponse = {
        requestId: 'request',
        recipient: BinaryTranslator.toBinary('recipient'),
        groupKeys: [ newEncryptedGroupKey ]
    }

    it('translates old protocol to protobuf', () => {
        const translated = GroupKeyResponseTranslator.toProtobuf(oldGroupKeyResponse)
        expect(translated.groupKeys).toEqual(newGroupKeyResponse.groupKeys)
        expect(translated.recipient).toEqual(newGroupKeyResponse.recipient)
        expect(translated.requestId).toEqual(newGroupKeyResponse.requestId)
    })

    it('translates protobuf to old protocol', () => {
        const translated = GroupKeyResponseTranslator.toClientProtocol(newGroupKeyResponse)
        expect(translated.encryptedGroupKeys).toEqual(oldGroupKeyResponse.encryptedGroupKeys)
        expect(translated.recipient).toEqual(oldGroupKeyResponse.recipient)
        expect(translated.requestId).toEqual(oldGroupKeyResponse.requestId)
    })
})
