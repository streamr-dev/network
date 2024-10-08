import crypto, { CipherKey } from 'crypto'
import { StreamMessage, StreamMessageAESEncrypted } from '../protocol/StreamMessage'
import { StreamMessageError } from '../protocol/StreamMessageError'
import { GroupKey } from './GroupKey'

export class DecryptError extends StreamMessageError {
    constructor(streamMessage: StreamMessage, message = '') {
        super(`Decrypt error: ${message}`, streamMessage)
    }
}

export const INITIALIZATION_VECTOR_LENGTH = 16

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class EncryptionUtil {
    private static validateRSAPublicKey(publicKey: crypto.KeyLike): void | never {
        const keyString = typeof publicKey === 'string' ? publicKey : publicKey.toString('utf8')
        if (typeof keyString !== 'string' || !keyString.startsWith('-----BEGIN PUBLIC KEY-----')
            || !keyString.endsWith('-----END PUBLIC KEY-----\n')) {
            throw new Error('"publicKey" must be a PKCS#8 RSA public key in the PEM format')
        }
    }

    static encryptWithRSAPublicKey(plaintextBuffer: Uint8Array, publicKey: crypto.KeyLike): Buffer {
        this.validateRSAPublicKey(publicKey)
        const ciphertextBuffer = crypto.publicEncrypt(publicKey, plaintextBuffer)
        return ciphertextBuffer
    }

    static decryptWithRSAPrivateKey(ciphertext: Uint8Array, privateKey: crypto.KeyLike): Buffer {
        return crypto.privateDecrypt(privateKey, ciphertext)
    }

    /*
     * Returns a hex string without the '0x' prefix.
     */
    static encryptWithAES(data: Uint8Array, cipherKey: CipherKey): Uint8Array {
        const iv = crypto.randomBytes(INITIALIZATION_VECTOR_LENGTH) // always need a fresh IV when using CTR mode
        const cipher = crypto.createCipheriv('aes-256-ctr', cipherKey, iv)
        return Buffer.concat([iv, cipher.update(data), cipher.final()])
    }

    /*
     * 'ciphertext' must be a hex string (without '0x' prefix), 'groupKey' must be a GroupKey. Returns a Buffer.
     */
    static decryptWithAES(cipher: Uint8Array, cipherKey: CipherKey): Buffer {
        const iv = cipher.slice(0, INITIALIZATION_VECTOR_LENGTH)
        const decipher = crypto.createDecipheriv('aes-256-ctr', cipherKey, iv)
        return Buffer.concat([decipher.update(cipher.slice(INITIALIZATION_VECTOR_LENGTH)), decipher.final()])
    }

    static decryptStreamMessage(streamMessage: StreamMessageAESEncrypted, groupKey: GroupKey): [Uint8Array, GroupKey?] | never {
        let content: Uint8Array
        try {
            content = this.decryptWithAES(streamMessage.content, groupKey.data)
        } catch (err) {
            throw new DecryptError(streamMessage, err.stack)
        }

        let newGroupKey: GroupKey | undefined = undefined
        if (streamMessage.newGroupKey) {
            try {
                newGroupKey = groupKey.decryptNextGroupKey(streamMessage.newGroupKey)
            } catch (err) {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                throw new DecryptError(streamMessage, `Could not decrypt new group key: ${err.stack}`)
            }
        }

        return [content, newGroupKey]
    }
}
