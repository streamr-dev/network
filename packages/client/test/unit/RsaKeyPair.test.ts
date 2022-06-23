import { RsaKeyPair } from '../../src/encryption/RsaKeyPair'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'

describe('RsaKeyPair', () => {
    let rsaKeyPair: RsaKeyPair

    beforeEach(async () => {
        rsaKeyPair = await RsaKeyPair.create()
    }, 10000)

    it('rsa decryption after encryption equals the initial plaintext', () => {
        const plaintext = 'some random text'
        const ciphertext = EncryptionUtil.encryptWithPublicKey(Buffer.from(plaintext, 'utf8'), rsaKeyPair.getPublicKey())
        expect(EncryptionUtil.decryptWithPrivateKey(ciphertext, rsaKeyPair.getPrivateKey()).toString('utf8')).toStrictEqual(plaintext)
    })

    it('rsa decryption after encryption equals the initial plaintext (hex strings)', () => {
        const plaintext = 'some random text'
        const ciphertext = EncryptionUtil.encryptWithPublicKey(Buffer.from(plaintext, 'utf8'), rsaKeyPair.getPublicKey(), true)
        expect(EncryptionUtil.decryptWithPrivateKey(ciphertext, rsaKeyPair.getPrivateKey(), true).toString('utf8')).toStrictEqual(plaintext)
    })
})
