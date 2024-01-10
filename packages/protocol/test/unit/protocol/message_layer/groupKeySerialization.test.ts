import GroupKeyRequest from '../../../../src/protocol/message_layer/GroupKeyRequest'
import { randomEthereumAddress } from '@streamr/test-utils'
import {
    deserializeGroupKeyRequest, deserializeGroupKeyResponse,
    serializeGroupKeyRequest, serializeGroupKeyResponse
} from '../../../../src/protocol/message_layer/groupKeySerialization'
import GroupKeyResponse from '../../../../src/protocol/message_layer/GroupKeyResponse'
import { randomBytes } from 'node:crypto'
import EncryptedGroupKey from '../../../../src/protocol/message_layer/EncryptedGroupKey'

describe('groupKeySerialization', () => {
    it('can serialize and then deserialize the same GroupKeyRequest back', () => {
        const request = new GroupKeyRequest({
            requestId: 'requestId',
            recipient: randomEthereumAddress(),
            rsaPublicKey: 'rsaPublicKey',
            groupKeyIds: ['groupKeyId1', 'groupKeyId2']
        })
        const serialized = serializeGroupKeyRequest(request)
        const deserialized = deserializeGroupKeyRequest(serialized)
        expect(deserialized).toEqual(request)
    })

    it('can serialize and then deserialize the same GroupKeyResponse back with empty groupKeyIds', () => {
        const response = new GroupKeyResponse({
            requestId: 'requestId',
            recipient: randomEthereumAddress(),
            encryptedGroupKeys: [
                new EncryptedGroupKey('groupKeyId1', randomBytes(32)),
                new EncryptedGroupKey('groupKeyId2', randomBytes(64))
            ]
        })
        const serialized = serializeGroupKeyResponse(response)
        const deserialized = deserializeGroupKeyResponse(serialized)
        expect(deserialized).toEqual(response)
    })
})
