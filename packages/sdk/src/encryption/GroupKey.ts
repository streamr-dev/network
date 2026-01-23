import { EncryptedGroupKey } from '@streamr/trackerless-network'
import { uuid } from '../utils/uuid'
import { EncryptionUtil } from './EncryptionUtil'
import { randomBytes } from '@noble/post-quantum/utils'
export class GroupKeyError extends Error {

    public groupKey?: GroupKey

    constructor(message: string, groupKey?: GroupKey) {
        super(message)
        this.groupKey = groupKey
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

    constructor(id: string, data: Buffer) {
        this.id = id
        if (!id) {
            throw new GroupKeyError(`groupKeyId must not be falsey ${id}`)
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
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new GroupKeyError(`${this.name} id must be a string: ${maybeGroupKey}`, maybeGroupKey)
        }
        if (maybeGroupKey.id.includes('---BEGIN')) {
            throw new GroupKeyError(
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                `${this.name} public/private key is not a valid group key id: ${maybeGroupKey}`,
                maybeGroupKey
            )
        }
        if (!maybeGroupKey.data || !Buffer.isBuffer(maybeGroupKey.data)) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            throw new GroupKeyError(`${this.name} data must be a Buffer: ${maybeGroupKey}`, maybeGroupKey)
        }
        if (maybeGroupKey.data.length !== 32) {
            throw new GroupKeyError(`Group key must have a size of 256 bits, not ${maybeGroupKey.data.length * 8}`, maybeGroupKey)
        }
    }

    static generate(id = uuid('GroupKey')): GroupKey {
        const keyBytes = randomBytes(32)
        return new GroupKey(id, Buffer.from(keyBytes))
    }

    /** @internal */
    encryptNextGroupKey(nextGroupKey: GroupKey): EncryptedGroupKey {
        return {
            id: nextGroupKey.id, 
            data: EncryptionUtil.encryptWithAES(nextGroupKey.data, this.data)
        }
    }

    /** @internal */
    decryptNextGroupKey(nextGroupKey: EncryptedGroupKey): GroupKey {
        return new GroupKey(
            nextGroupKey.id,
            EncryptionUtil.decryptWithAES(nextGroupKey.data, this.data)
        )
    }

}
