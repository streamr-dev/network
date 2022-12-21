import { validateIsString } from '../../utils/validations'

/** @internal */
export type EncryptedGroupKeySerialized = [string, string]
export default class EncryptedGroupKey {

    groupKeyId: string
    encryptedGroupKeyHex: string
    serialized: string | null

    /**
     * A pair (groupKeyId, encryptedGroupKey) where the encryptedGroupKey is an encrypted, hex-encoded version of the group key.
     * @param encryptedGroupKeyHex
     * @param serialized Optional. If given, this exact string is returned from serialize().
     */
    constructor(encryptedGroupKeyHex: string, serialized: string | null = null) {
        this.groupKeyId = encryptedGroupKeyHex

        validateIsString('encryptedGroupKeyHex', encryptedGroupKeyHex)
        this.encryptedGroupKeyHex = encryptedGroupKeyHex

        validateIsString('serialized', serialized, true)
        this.serialized = serialized
    }

    toArray(): EncryptedGroupKeySerialized {
        return [this.groupKeyId, this.encryptedGroupKeyHex]
    }

    serialize(): string {
        // Return the cached serialized form to ensure that it stays unchanged (important for validation)
        if (this.serialized) {
            return this.serialized
        }
        return JSON.stringify(this.toArray())
    }

    static deserialize(json: string): EncryptedGroupKey {
        const [groupKeyId] = JSON.parse(json)
        return new EncryptedGroupKey(groupKeyId, json)
    }

    static fromArray(arr: EncryptedGroupKeySerialized): EncryptedGroupKey {
        const [groupKeyId] = arr
        return new EncryptedGroupKey(groupKeyId)
    }
}
