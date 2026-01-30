import { ml_kem1024 } from '@noble/post-quantum/ml-kem'
import { randomBytes } from '@noble/post-quantum/utils'
import { AsymmetricEncryptionType } from '@streamr/trackerless-network'
import { binaryToUtf8, getSubtle, privateDecrypt, publicEncrypt } from '@streamr/utils'
import { decryptWithAES, encryptWithAES } from './aesUtils'

const INFO = Buffer.from('streamr-key-exchange')
const KEM_CIPHER_LENGTH_BYTES = 1568
const KDF_SALT_LENGTH_BYTES = 64

/**
 * Asymmetric encryption utility class for RSA and ML-KEM (post-quantum) key exchange.
 *
 * For AES symmetric encryption of stream messages, use EncryptionService instead.
 * This class only handles asymmetric encryption for key exchange operations.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class EncryptionUtil {
    /**
     * Public API for asymmetric encryption, unified interface across the different AsymmetricEncryptionTypes
     */
    static async encryptForPublicKey(plaintext: Uint8Array, publicKey: Uint8Array, type: AsymmetricEncryptionType): Promise<Buffer> {
        if (type === AsymmetricEncryptionType.ML_KEM) {
            return this.encryptWithMLKEMPublicKey(plaintext, publicKey)
        }
        if (type === AsymmetricEncryptionType.RSA) {
            return this.encryptWithRSAPublicKey(plaintext, publicKey)
        }
        throw new Error(`Unexpected encryption type: ${type}`)
    }

    static async decryptWithPrivateKey(cipher: Uint8Array, privateKey: Uint8Array, type: AsymmetricEncryptionType): Promise<Buffer> {
        if (type === AsymmetricEncryptionType.ML_KEM) {
            return this.decryptWithMLKEMPrivateKey(cipher, privateKey)
        }
        if (type === AsymmetricEncryptionType.RSA) {
            return this.decryptWithRSAPrivateKey(cipher, privateKey)
        }
        throw new Error(`Unexpected encryption type: ${type}`)
    }

    /**
     * RSA
     */
    private static toRSAPublicKeyString(publicKey: Uint8Array): string {
        // RSA publicKey passed around in string format for legacy reasons
        const keyString = binaryToUtf8(publicKey)
        if (!keyString.startsWith('-----BEGIN PUBLIC KEY-----')
            || !keyString.endsWith('-----END PUBLIC KEY-----\n')) {
            throw new Error('"publicKey" must be an RSA public key (SPKI) in PEM format, encoded in UTF-8')
        }
        return keyString
    }

    private static toRSAPrivateKeyString(privateKey: Uint8Array): string {
        // RSA privateKey passed around in string format for legacy reasons
        const keyString = binaryToUtf8(privateKey)
        if (!keyString.startsWith('-----BEGIN PRIVATE KEY-----')
            || !keyString.endsWith('-----END PRIVATE KEY-----\n')) {
            throw new Error('"privateKey" must be a PKCS#8 RSA private key in PEM format, encoded in UTF-8')
        }
        return keyString
    }

    private static encryptWithRSAPublicKey(plaintextBuffer: Uint8Array, publicKey: Uint8Array): Buffer {
        const keyString = this.toRSAPublicKeyString(publicKey)
        const ciphertextBuffer = publicEncrypt(keyString, plaintextBuffer)
        return ciphertextBuffer
    }

    private static decryptWithRSAPrivateKey(ciphertext: Uint8Array, privateKey: Uint8Array): Buffer {
        const keyString = this.toRSAPrivateKeyString(privateKey)
        return privateDecrypt(keyString, ciphertext)
    }

    /**
     * ML-KEM
     */
    private static async deriveAESWrapperKey(sharedSecret: Uint8Array, kdfSalt: Uint8Array): Promise<Uint8Array> {
        const subtle = getSubtle()
        const keyMaterial = await subtle.importKey(
            'raw',
            sharedSecret,
            { name: 'HKDF' },
            false,
            ['deriveKey']
        )
    
        const derivedKey = await subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-512',
                salt: kdfSalt,
                info: INFO
            },
            keyMaterial,
            { name: 'AES-CTR', length: 256 },
            true,
            ['encrypt', 'decrypt']
        )
    
        const exportedKey = await subtle.exportKey('raw', derivedKey)
        return new Uint8Array(exportedKey)
    }

    private static async encryptWithMLKEMPublicKey(plaintextBuffer: Uint8Array, publicKey: Uint8Array): Promise<Buffer> {
        // Encapsulate to get kemCipher and shared secret
        // The recipient will be able to derive sharedSecret using privateKey and kemCipher
        const { cipherText: kemCipher, sharedSecret } = ml_kem1024.encapsulate(publicKey)

        if (kemCipher.length !== KEM_CIPHER_LENGTH_BYTES) {
            throw new Error(`Expected KEM cipher to be ${KEM_CIPHER_LENGTH_BYTES}, but it was ${kemCipher.length} bytes`)
        }

        // Derive an AES wrapping key from the shared secret using HKDF
        // The recipient will be able to repeat this computation to derive the same key
        const kdfSalt = randomBytes(KDF_SALT_LENGTH_BYTES)
        const wrappingAESKey = await this.deriveAESWrapperKey(sharedSecret, kdfSalt)
        
        // Encrypt plaintext with the AES wrapping key
        const aesEncryptedPlaintext = encryptWithAES(plaintextBuffer, Buffer.from(wrappingAESKey))

        // Concatenate the deliverables into a binary package
        return Buffer.concat([kemCipher, kdfSalt, aesEncryptedPlaintext])
    }

    private static async decryptWithMLKEMPrivateKey(cipherPackage: Uint8Array, privateKey: Uint8Array): Promise<Buffer> {
        // Split the cipherPackage, see encryptWithMLKEMPublicKey how it's constructed
        let pos = 0
        const kemCipher = cipherPackage.slice(0, KEM_CIPHER_LENGTH_BYTES)
        pos += KEM_CIPHER_LENGTH_BYTES
        const kdfSalt = cipherPackage.slice(pos, pos + KDF_SALT_LENGTH_BYTES)
        pos += KDF_SALT_LENGTH_BYTES
        const aesEncryptedPlaintext = cipherPackage.slice(pos)

        // Derive the shared secret using the private key and kemCipher
        const sharedSecret = ml_kem1024.decapsulate(kemCipher, privateKey)

        // Derive the wrappingAESKey
        const wrappingAESKey = await this.deriveAESWrapperKey(sharedSecret, kdfSalt)

        // Decrypt the aesEncryptedPlaintext
        return decryptWithAES(aesEncryptedPlaintext, Buffer.from(wrappingAESKey))
    }
}
