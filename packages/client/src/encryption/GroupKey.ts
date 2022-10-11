import crypto from 'crypto'
import { EncryptedGroupKey } from 'streamr-client-protocol'
import { uuid } from '../utils/uuid'
import { EncryptionUtil } from './EncryptionUtil'

export type GroupKeyId = string

export class GroupKeyError extends Error {
    constructor(message: string, public groupKey?: GroupKey) {
        super(message)
    }
}

/**
 * GroupKeys are AES cipher keys, which are used to encrypt/decrypt StreamMessages (when encryptionType is AES).
 * Each group key contains 256 random bits of key data and an UUID.
 *
 * A group key stores the same key data in two fields: the bytes as hex-encoded string, and as a raw Uint8Array.
 * TODO: If this data duplication doesn't give us any performance improvement we could store the key data only
 * in one field.
 */

export class GroupKey {

    /** @internal */
    readonly id: GroupKeyId
    /** @internal */
    readonly hex: string
    /** @internal */
    readonly data: Uint8Array

    constructor(groupKeyId: GroupKeyId, data: Uint8Array) {
        this.id = groupKeyId
        if (!groupKeyId) {
            throw new GroupKeyError(`groupKeyId must not be falsey ${groupKeyId}`)
        }
        if (!data) {
            throw new GroupKeyError(`groupKeyBufferOrHexString must not be falsey ${data}`)
        }
        this.data = data
        this.hex = Buffer.from(this.data).toString('hex')
        GroupKey.validate(this)
    }

    private static validate(maybeGroupKey: GroupKey): void | never {
        if (!maybeGroupKey) {
            throw new GroupKeyError(`value must be a ${this.name}: ${maybeGroupKey}`, maybeGroupKey)
        }
        if (!(maybeGroupKey instanceof this)) {
            throw new GroupKeyError(`value must be a ${this.name}: ${maybeGroupKey}`, maybeGroupKey)
        }
        if (!maybeGroupKey.id || typeof maybeGroupKey.id !== 'string') {
            throw new GroupKeyError(`${this.name} id must be a string: ${maybeGroupKey}`, maybeGroupKey)
        }
        if (maybeGroupKey.id.includes('---BEGIN')) {
            throw new GroupKeyError(
                `${this.name} public/private key is not a valid group key id: ${maybeGroupKey}`,
                maybeGroupKey
            )
        }
        if (!maybeGroupKey.data || !Buffer.isBuffer(maybeGroupKey.data)) {
            throw new GroupKeyError(`${this.name} data must be a Buffer: ${maybeGroupKey}`, maybeGroupKey)
        }
        if (!maybeGroupKey.hex || typeof maybeGroupKey.hex !== 'string') {
            throw new GroupKeyError(`${this.name} hex must be a string: ${maybeGroupKey}`, maybeGroupKey)
        }
        if (maybeGroupKey.data.length !== 32) {
            throw new GroupKeyError(`Group key must have a size of 256 bits, not ${maybeGroupKey.data.length * 8}`, maybeGroupKey)
        }
    }

    equals(other: GroupKey): boolean {
        if (!(other instanceof GroupKey)) {
            return false
        }
        return this === other || (this.hex === other.hex && this.id === other.id)
    }

    toString(): string {
        return this.id
    }

    toArray(): string[] {
        return [this.id, this.hex]
    }

    serialize(): string {
        return JSON.stringify(this.toArray())
    }

    static generate(id = uuid('GroupKey')): GroupKey {
        const keyBytes = crypto.randomBytes(32)
        return new GroupKey(id, keyBytes)
    }

    encryptNextGroupKey(nextGroupKey: GroupKey): EncryptedGroupKey {
        return new EncryptedGroupKey(nextGroupKey.id, EncryptionUtil.encryptWithAES(nextGroupKey.data, this.data))
    }

    decryptNextGroupKey(nextGroupKey: EncryptedGroupKey): GroupKey {
        return new GroupKey(
            nextGroupKey.groupKeyId,
            EncryptionUtil.decryptWithAES(nextGroupKey.encryptedGroupKeyHex, this.data)
        )
    }

    static decryptRSAEncrypted(encryptedKey: EncryptedGroupKey, rsaPrivateKey: string): GroupKey {
        return new GroupKey(
            encryptedKey.groupKeyId,
            EncryptionUtil.decryptWithRSAPrivateKey(encryptedKey.encryptedGroupKeyHex, rsaPrivateKey, true)
        )
    }
}
