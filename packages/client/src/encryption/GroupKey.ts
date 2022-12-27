import crypto from 'crypto'
import { EncryptedGroupKey } from '@streamr/protocol'
import { uuid } from '../utils/uuid'
import { EncryptionUtil } from './EncryptionUtil'

export class GroupKeyError extends Error {
    constructor(message: string, public groupKey?: GroupKey) {
        super(message)
    }
}

/**
 * GroupKeys are AES cipher keys, which are used to encrypt/decrypt StreamMessages (when encryptionType is AES).
 * Each group key contains 256 random bits of key data and an UUID.
 */

export class GroupKey {

    /** @internal */
    readonly id: string
    /** @internal */
    readonly data: Buffer

    constructor(groupKeyId: string, data: Buffer) {
        this.id = groupKeyId
        if (!groupKeyId) {
            throw new GroupKeyError(`groupKeyId must not be falsey ${groupKeyId}`)
        }
        if (!data) {
            throw new GroupKeyError(`groupKeyBufferOrHexString must not be falsey ${data}`)
        }
        this.data = data
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
        if (maybeGroupKey.data.length !== 32) {
            throw new GroupKeyError(`Group key must have a size of 256 bits, not ${maybeGroupKey.data.length * 8}`, maybeGroupKey)
        }
    }

    static generate(id = uuid('GroupKey')): GroupKey {
        const keyBytes = crypto.randomBytes(32)
        return new GroupKey(id, keyBytes)
    }

    /** @internal */
    encryptNextGroupKey(nextGroupKey: GroupKey): EncryptedGroupKey {
        return new EncryptedGroupKey(nextGroupKey.id, EncryptionUtil.encryptWithAES(nextGroupKey.data, this.data))
    }

    /** @internal */
    decryptNextGroupKey(nextGroupKey: EncryptedGroupKey): GroupKey {
        return new GroupKey(
            nextGroupKey.groupKeyId,
            EncryptionUtil.decryptWithAES(nextGroupKey.encryptedGroupKeyHex, this.data)
        )
    }

    /** @internal */
    static decryptRSAEncrypted(encryptedKey: EncryptedGroupKey, rsaPrivateKey: string): GroupKey {
        return new GroupKey(
            encryptedKey.groupKeyId,
            EncryptionUtil.decryptWithRSAPrivateKey(encryptedKey.encryptedGroupKeyHex, rsaPrivateKey, true)
        )
    }
}
