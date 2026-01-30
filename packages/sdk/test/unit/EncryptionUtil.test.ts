import { AsymmetricEncryptionType } from '@streamr/trackerless-network'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { MLKEMKeyPair } from '../../src/encryption/MLKEMKeyPair'
import { RSAKeyPair } from '../../src/encryption/RSAKeyPair'

describe('EncryptionUtil', () => {

    const plaintext = Buffer.from('some random text', 'utf8')

    describe('RSA', () => {
        it('returns a ciphertext which is different from the plaintext', async () => {
            const key = await RSAKeyPair.create(512)
            const ciphertext = await EncryptionUtil.encryptForPublicKey(plaintext, key.getPublicKey(), AsymmetricEncryptionType.RSA)
            expect(ciphertext).not.toStrictEqual(plaintext)
        })

        it('returns the initial plaintext after decrypting the ciphertext', async () => {
            const key = await RSAKeyPair.create(512)
            const ciphertext = await EncryptionUtil.encryptForPublicKey(plaintext, key.getPublicKey(), AsymmetricEncryptionType.RSA)
            expect(await EncryptionUtil.decryptWithPrivateKey(ciphertext, key.getPrivateKey(), AsymmetricEncryptionType.RSA)).toStrictEqual(plaintext)
        })
    
        it('produces different ciphertexts upon multiple encrypt() calls', async () => {
            const key = await RSAKeyPair.create(512)
            const cipher1 = await EncryptionUtil.encryptForPublicKey(plaintext, key.getPublicKey(), AsymmetricEncryptionType.RSA)
            const cipher2 = await EncryptionUtil.encryptForPublicKey(plaintext, key.getPublicKey(), AsymmetricEncryptionType.RSA)
            expect(cipher1).not.toStrictEqual(cipher2)
        })
    })

    describe('ML-KEM', () => {
        it('returns a ciphertext which is different from the plaintext', async () => {
            const key = MLKEMKeyPair.create()
            const ciphertext = await EncryptionUtil.encryptForPublicKey(plaintext, key.getPublicKey(), AsymmetricEncryptionType.ML_KEM)
            expect(ciphertext).not.toStrictEqual(plaintext)
        })

        it('returns the initial plaintext after decrypting the ciphertext', async () => {
            const key = MLKEMKeyPair.create()
            const ciphertext = await EncryptionUtil.encryptForPublicKey(plaintext, key.getPublicKey(), AsymmetricEncryptionType.ML_KEM)
            expect(await EncryptionUtil.decryptWithPrivateKey(
                ciphertext, key.getPrivateKey(), AsymmetricEncryptionType.ML_KEM
            )).toStrictEqual(plaintext)
        })
    
        it('produces different ciphertexts upon multiple encrypt() calls', async () => {
            const key = MLKEMKeyPair.create()
            const cipher1 = await EncryptionUtil.encryptForPublicKey(plaintext, key.getPublicKey(), AsymmetricEncryptionType.ML_KEM)
            const cipher2 = await EncryptionUtil.encryptForPublicKey(plaintext, key.getPublicKey(), AsymmetricEncryptionType.ML_KEM)
            expect(cipher1).not.toStrictEqual(cipher2)
        })
    })
})
