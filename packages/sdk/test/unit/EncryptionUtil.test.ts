import { createTestWallet } from '@streamr/test-utils'
import { StreamPartIDUtils, hexToBinary, toStreamID, toStreamPartID, utf8ToBinary } from '@streamr/utils'
import { EncryptionUtil, INITIALIZATION_VECTOR_LENGTH } from '../../src/encryption/EncryptionUtil'
import { GroupKey } from '../../src/encryption/GroupKey'
import { StreamrClientError } from '../../src/StreamrClientError'
import { createMockMessage } from '../test-utils/utils'
import { StreamMessage, StreamMessageAESEncrypted } from './../../src/protocol/StreamMessage'
import { AsymmetricEncryptionType } from '@streamr/trackerless-network'
import { RSAKeyPair } from '../../src/encryption/RSAKeyPair'
import { MLKEMKeyPair } from '../../src/encryption/MLKEMKeyPair'

const STREAM_ID = toStreamID('streamId')

describe('EncryptionUtil', () => {

    const plaintext = Buffer.from('some random text', 'utf8')

    describe('AES', () => {
        it('returns a ciphertext which is different from the plaintext', () => {
            const key = GroupKey.generate()
            const ciphertext = EncryptionUtil.encryptWithAES(plaintext, key.data)
            expect(ciphertext).not.toStrictEqual(plaintext)
        })

        it('returns the initial plaintext after decrypting the ciphertext', () => {
            const key = GroupKey.generate()
            const ciphertext = EncryptionUtil.encryptWithAES(plaintext, key.data)
            expect(EncryptionUtil.decryptWithAES(ciphertext, key.data)).toStrictEqual(plaintext)
        })
    
        it('preserves size (plaintext + iv)', () => {
            const key = GroupKey.generate()
            const ciphertext = EncryptionUtil.encryptWithAES(plaintext, key.data)
            expect(ciphertext.length).toStrictEqual(plaintext.length + INITIALIZATION_VECTOR_LENGTH)
        })
    
        it('produces different ivs and ciphertexts upon multiple encrypt() calls', () => {
            const key = GroupKey.generate()
            const cipher1 = EncryptionUtil.encryptWithAES(plaintext, key.data)
            const cipher2 = EncryptionUtil.encryptWithAES(plaintext, key.data)
            expect(cipher1.slice(0, INITIALIZATION_VECTOR_LENGTH)).not.toStrictEqual(cipher2.slice(0, INITIALIZATION_VECTOR_LENGTH))
            expect(cipher1.slice(INITIALIZATION_VECTOR_LENGTH)).not.toStrictEqual(cipher2.slice(INITIALIZATION_VECTOR_LENGTH))
        })
    })

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
    
    describe('StreamMessage decryption', () => {
        it('passes the happy path', async () => {
            const key = GroupKey.generate()
            const nextKey = GroupKey.generate()
            const streamMessage = await createMockMessage({
                streamPartId: StreamPartIDUtils.parse('stream#0'),
                publisher: await createTestWallet(),
                content: {
                    foo: 'bar'
                },
                encryptionKey: key,
                nextEncryptionKey: nextKey
            }) as StreamMessageAESEncrypted
            const [content, newGroupKey] = EncryptionUtil.decryptStreamMessage(streamMessage, key)
            expect(content).toEqualBinary(utf8ToBinary('{"foo":"bar"}'))
            expect(newGroupKey).toEqual(nextKey)
        })
    
        it('throws if newGroupKey invalid', async () => {
            const key = GroupKey.generate()
            const msg = await createMockMessage({
                publisher: await createTestWallet(),
                streamPartId: toStreamPartID(STREAM_ID, 0),
                encryptionKey: key
            })
            const msg2 = new StreamMessage({
                ...msg,
                newGroupKey: { id: 'mockId', data: hexToBinary('0x1234') }
            }) as StreamMessageAESEncrypted
            expect(() => EncryptionUtil.decryptStreamMessage(msg2, key)).toThrowStreamrClientError(
                new StreamrClientError('Could not decrypt new encryption key', 'DECRYPT_ERROR', msg2)
            )
        })
    })
})
