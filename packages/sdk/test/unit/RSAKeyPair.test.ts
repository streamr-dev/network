import { RSAKeyPair } from '../../src/encryption/RSAKeyPair'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'

describe('RSAKeyPair', () => {
    let rsaKeyPair: RSAKeyPair

    beforeEach(async () => {
        rsaKeyPair = await RSAKeyPair.create(512)
    })

    it('rsa decryption after encryption equals the initial plaintext', () => {
        const plaintext = 'some random text'
        const ciphertext = EncryptionUtil.encryptWithRSAPublicKey(
            Buffer.from(plaintext, 'utf8'),
            rsaKeyPair.getPublicKey()
        )
        expect(
            EncryptionUtil.decryptWithRSAPrivateKey(ciphertext, rsaKeyPair.getPrivateKey()).toString('utf8')
        ).toStrictEqual(plaintext)
    })
})
