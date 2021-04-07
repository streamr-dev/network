import { validateIsString } from '../../utils/validations'

export default class EncryptedGroupKey {

    groupKeyId: string
    encryptedGroupKeyHex: string
    serialized: string | null

    /**
     * A pair (groupKeyId, encryptedGroupKey) where the encryptedGroupKey is an encrypted, hex-encoded version of the group key.
     * @param groupKeyId
     * @param encryptedGroupKeyHex
     * @param serialized Optional. If given, this exact string is returned from serialize().
     */
    constructor(groupKeyId: string, encryptedGroupKeyHex: string, serialized: string | null = null) {
        validateIsString('groupKeyId', groupKeyId)
        this.groupKeyId = groupKeyId

        validateIsString('encryptedGroupKeyHex', encryptedGroupKeyHex)
        this.encryptedGroupKeyHex = encryptedGroupKeyHex

        validateIsString('serialized', serialized, true)
        this.serialized = serialized
    }

    toArray() {
        return [this.groupKeyId, this.encryptedGroupKeyHex]
    }

    serialize() {
        // Return the cached serialized form to ensure that it stays unchanged (important for validation)
        if (this.serialized) {
            return this.serialized
        }
        return JSON.stringify(this.toArray())
    }

    static deserialize(json: any) {
        const [groupKeyId, encryptedGroupKeyHex] = JSON.parse(json)
        return new EncryptedGroupKey(groupKeyId, encryptedGroupKeyHex, json)
    }

    static fromArray(arr: any[]) {
        const [groupKeyId, encryptedGroupKeyHex] = arr
        return new EncryptedGroupKey(groupKeyId, encryptedGroupKeyHex)
    }
}
