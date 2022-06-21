import { RsaKeyPair } from '../../src/encryption/RsaKeyPair'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'

console.log('RsaKeyPair.0')

describe('RsaKeyPair', () => {
    let rsaKeyPair: RsaKeyPair

    beforeEach(async () => {
        console.log('RsaKeyPair.1')
        rsaKeyPair = await RsaKeyPair.create()
    }, 10000)

    it('rsa decryption after encryption equals the initial plaintext', () => {
        console.log('RsaKeyPair.2')
        const plaintext = 'some random text'
        const ciphertext = EncryptionUtil.encryptWithPublicKey(Buffer.from(plaintext, 'utf8'), rsaKeyPair.getPublicKey())
        console.log('RsaKeyPair.3')
        expect(EncryptionUtil.decryptWithPrivateKey(ciphertext, rsaKeyPair.getPrivateKey()).toString('utf8')).toStrictEqual(plaintext)
        console.log('RsaKeyPair.4')
    })

    it('rsa decryption after encryption equals the initial plaintext (hex strings)', () => {
        const plaintext = 'some random text'
        const ciphertext = EncryptionUtil.encryptWithPublicKey(Buffer.from(plaintext, 'utf8'), rsaKeyPair.getPublicKey(), true)
        expect(EncryptionUtil.decryptWithPrivateKey(ciphertext, rsaKeyPair.getPrivateKey(), true).toString('utf8')).toStrictEqual(plaintext)
    })
})
