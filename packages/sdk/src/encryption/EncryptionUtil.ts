import crypto, { CipherKey } from 'crypto'
import { ml_kem1024 } from '@noble/post-quantum/ml-kem';
import { randomBytes } from '@noble/post-quantum/utils';
import { StreamMessageAESEncrypted } from '../protocol/StreamMessage'
import { StreamrClientError } from '../StreamrClientError'
import { GroupKey } from './GroupKey'

export const INITIALIZATION_VECTOR_LENGTH = 16

const INFO = Buffer.from('streamr-key-exchange')
const KEM_CIPHER_LENGTH_BYTES = 1568
const KDF_SALT_LENGTH_BYTES = 64

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

    static encryptWithMLKEMPublicKey(plaintextBuffer: Uint8Array, publicKey: Uint8Array): Buffer {
        // Encapsulate to get kemCipher and shared secret
        // The recipient will be able to derive sharedSecret using privateKey and kemCipher
        const { cipherText: kemCipher, sharedSecret } = ml_kem1024.encapsulate(publicKey);

        if (kemCipher.length !== KEM_CIPHER_LENGTH_BYTES) {
            throw new Error(`Expected KEM cipher to be ${KEM_CIPHER_LENGTH_BYTES}, but it was ${kemCipher.length} bytes`)
        }

        // Derive an AES wrapping key from the shared secret using HKDF
        // The recipient will be able to repeat this computation to derive the same key
        const kdfSalt = randomBytes(KDF_SALT_LENGTH_BYTES)
        const wrappingAESKey = crypto.hkdfSync('sha512', sharedSecret, kdfSalt, INFO, 32);
        
        // Encrypt plaintext with the AES wrapping key
        const aesEncryptedPlaintext = this.encryptWithAES(plaintextBuffer, Buffer.from(wrappingAESKey))

        // Concatenate the deliverables into a binary package
        return Buffer.concat([kemCipher, kdfSalt, aesEncryptedPlaintext]);
    }

    static decryptWithMLKEMPrivateKey(cipherPackage: Uint8Array, privateKey: Uint8Array): Buffer {
        // Split the cipherPackage, see encryptWithMLKEMPublicKey how it's constructed
        let pos = 0
        const kemCipher = cipherPackage.slice(0, KEM_CIPHER_LENGTH_BYTES);
        pos += KEM_CIPHER_LENGTH_BYTES
        const kdfSalt = cipherPackage.slice(pos, pos + KDF_SALT_LENGTH_BYTES);
        pos += KDF_SALT_LENGTH_BYTES
        const aesEncryptedPlaintext = cipherPackage.slice(pos);

        // Derive the shared secret using the private key and kemCipher
        const sharedSecret = ml_kem1024.decapsulate(kemCipher, privateKey);

        // Derive the wrappingAESKey
        const wrappingAESKey = crypto.hkdfSync('sha512', sharedSecret, kdfSalt, INFO, 32);

        // Decrypt the aesEncryptedPlaintext
        return this.decryptWithAES(aesEncryptedPlaintext, Buffer.from(wrappingAESKey))
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
        } catch {
            throw new StreamrClientError('AES decryption failed', 'DECRYPT_ERROR', streamMessage)
        }

        let newGroupKey: GroupKey | undefined = undefined
        if (streamMessage.newGroupKey) {
            try {
                newGroupKey = groupKey.decryptNextGroupKey(streamMessage.newGroupKey)
            } catch {
                throw new StreamrClientError('Could not decrypt new encryption key', 'DECRYPT_ERROR', streamMessage)
            }
        }

        return [content, newGroupKey]
    }
}
