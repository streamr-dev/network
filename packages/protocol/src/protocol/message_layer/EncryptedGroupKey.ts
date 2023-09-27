import { validateIsString, validateIsType } from '../../utils/validations'
import { binaryToHex, hexToBinary } from '@streamr/utils'

/** @internal */
export type EncryptedGroupKeySerialized = [string, string]
export default class EncryptedGroupKey {

    groupKeyId: string
    data: Uint8Array
    serialized: string | null

    /**
     * A pair (groupKeyId, encryptedGroupKey) where the encryptedGroupKey is an encrypted, hex-encoded version of the group key.
     * @param groupKeyId
     * @param data
     * @param serialized Optional. If given, this exact string is returned from serialize().
     */
    constructor(groupKeyId: string, data: Uint8Array, serialized: string | null = null) {
        validateIsString('groupKeyId', groupKeyId)
        this.groupKeyId = groupKeyId

        validateIsType('data', data, 'Uint8Array', Uint8Array)
        this.data = data

        validateIsString('serialized', serialized, true)
        this.serialized = serialized
    }

    /** @internal */
    toArray(): EncryptedGroupKeySerialized {
        return [this.groupKeyId, binaryToHex(this.data)]
    }

    serialize(): string {
        // Return the cached serialized form to ensure that it stays unchanged (important for validation)
        if (this.serialized) {
            return this.serialized
        }
        return JSON.stringify(this.toArray())
    }

    static deserialize(json: string): EncryptedGroupKey {
        const [groupKeyId, data] = JSON.parse(json)
        return new EncryptedGroupKey(groupKeyId, hexToBinary(data), json)
    }
    
    /** @internal */
    static fromArray(arr: EncryptedGroupKeySerialized): EncryptedGroupKey {
        const [groupKeyId, data] = arr
        return new EncryptedGroupKey(groupKeyId, hexToBinary(data))
    }
}
