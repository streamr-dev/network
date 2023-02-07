import { GroupKeyRequest as OldGroupKeyRequest } from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { GroupKeyRequest } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { GroupKeyRequestTranslator } from '../../src/logic/protocol-integration/stream-message/GroupKeyRequestTranslator'

describe('GroupKeyRequestTranslator', () => {

    const oldGroupKeyRequest = new OldGroupKeyRequest({
        rsaPublicKey: 'aaaaaaaa',
        recipient: 'recipient' as EthereumAddress,
        requestId: 'request',
        groupKeyIds: ['id1', 'id2', 'id3']
    })
    const newGroupKeyRequest: GroupKeyRequest = {
        rsaPublicKey: 'aaaaaaaa',
        recipient: 'recipient',
        requestId: 'request',
        groupKeyIds: ['id1', 'id2', 'id3']
    }

    it('translates old protocol to protobuf', () => {
        const translated = GroupKeyRequestTranslator.toProtobuf(oldGroupKeyRequest)
        expect(translated.rsaPublicKey).toEqual(newGroupKeyRequest.rsaPublicKey)
        expect(translated.recipient).toEqual(newGroupKeyRequest.recipient)
        expect(translated.requestId).toEqual(newGroupKeyRequest.requestId)
        expect(translated.groupKeyIds).toEqual(newGroupKeyRequest.groupKeyIds)
    })

    it('translates protobuf to old protocol', () => {
        const translated = GroupKeyRequestTranslator.toClientProtocol(newGroupKeyRequest)
        expect(translated.rsaPublicKey).toEqual(oldGroupKeyRequest.rsaPublicKey)
        expect(translated.recipient).toEqual(oldGroupKeyRequest.recipient)
        expect(translated.requestId).toEqual(oldGroupKeyRequest.requestId)
        expect(translated.groupKeyIds).toEqual(oldGroupKeyRequest.groupKeyIds)
    })
})
