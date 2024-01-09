import { binaryToHex, binaryToUtf8, hexToBinary, utf8ToBinary } from '@streamr/utils'
import GroupKeyRequest from './GroupKeyRequest'
import GroupKeyResponse from './GroupKeyResponse'
import EncryptedGroupKey from './EncryptedGroupKey'

export function deserializeGroupKeyRequest(rawContent: Uint8Array): GroupKeyRequest {
    const [requestId, recipient, rsaPublicKey, groupKeyIds] = JSON.parse(binaryToUtf8(rawContent))
    return new GroupKeyRequest({
        requestId, recipient, rsaPublicKey, groupKeyIds
    })
}

export function deserializeGroupKeyResponse(rawContent: Uint8Array): GroupKeyResponse {
    const [requestId, recipient, encryptedGroupKeys] = JSON.parse(binaryToUtf8(rawContent))
    return new GroupKeyResponse({
        requestId, recipient, encryptedGroupKeys: encryptedGroupKeys.map((json: any) => {
            const [groupKeyId, data] = JSON.parse(json)
            return new EncryptedGroupKey(groupKeyId, hexToBinary(data))
        })
    })
}

export function serializeGroupKeyRequest(request: GroupKeyRequest): Uint8Array {
    const json = JSON.stringify([
        request.requestId,
        request.recipient,
        request.rsaPublicKey,
        request.groupKeyIds
    ])
    return utf8ToBinary(json)
}

export function serializeGroupKeyResponse(request: GroupKeyResponse): Uint8Array {
    const json = JSON.stringify([
        request.requestId,
        request.recipient,
        request.encryptedGroupKeys.map((s) => {
            return JSON.stringify([s.groupKeyId, binaryToHex(s.data)])
        })])
    return utf8ToBinary(json)
}
