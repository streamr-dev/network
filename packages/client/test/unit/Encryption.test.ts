import crypto from 'crypto'

import { ethers } from 'ethers'
import { MessageLayer } from 'streamr-client-protocol'

import EncryptionUtil, { GroupKey } from '../../src/stream/encryption/Encryption'

const { StreamMessage, MessageID } = MessageLayer

// wrap these tests so can run same tests as if in browser
function TestEncryptionUtil({ isBrowser = false } = {}) {
    describe(`EncryptionUtil ${isBrowser ? 'Browser' : 'Server'}`, () => {
        beforeAll(() => {
            // this is the toggle used in EncryptionUtil to
            // use the webcrypto apis
            // @ts-expect-error
            process.browser = !!isBrowser
        })
        afterAll(() => {
            // @ts-expect-error
            process.browser = !isBrowser
        })

        it('rsa decryption after encryption equals the initial plaintext', async () => {
            const encryptionUtil = await EncryptionUtil.create()
            const plaintext = 'some random text'
            const ciphertext = EncryptionUtil.encryptWithPublicKey(Buffer.from(plaintext, 'utf8'), encryptionUtil.getPublicKey())
            expect(encryptionUtil.decryptWithPrivateKey(ciphertext).toString('utf8')).toStrictEqual(plaintext)
        })

        it('rsa decryption after encryption equals the initial plaintext (hex strings)', async () => {
            const encryptionUtil = await EncryptionUtil.create()
            const plaintext = 'some random text'
            const ciphertext = EncryptionUtil.encryptWithPublicKey(Buffer.from(plaintext, 'utf8'), encryptionUtil.getPublicKey(), true)
            expect(encryptionUtil.decryptWithPrivateKey(ciphertext, true).toString('utf8')).toStrictEqual(plaintext)
        })

        it('aes decryption after encryption equals the initial plaintext', () => {
            const key = GroupKey.generate()
            const plaintext = 'some random text'
            const ciphertext = EncryptionUtil.encrypt(Buffer.from(plaintext, 'utf8'), key)
            expect(EncryptionUtil.decrypt(ciphertext, key).toString('utf8')).toStrictEqual(plaintext)
        })

        it('aes encryption preserves size (plus iv)', () => {
            const key = GroupKey.generate()
            const plaintext = 'some random text'
            const plaintextBuffer = Buffer.from(plaintext, 'utf8')
            const ciphertext = EncryptionUtil.encrypt(plaintextBuffer, key)
            const ciphertextBuffer = ethers.utils.arrayify(`0x${ciphertext}`)
            expect(ciphertextBuffer.length).toStrictEqual(plaintextBuffer.length + 16)
        })

        it('multiple same encrypt() calls use different ivs and produce different ciphertexts', () => {
            const key = GroupKey.generate()
            const plaintext = 'some random text'
            const ciphertext1 = EncryptionUtil.encrypt(Buffer.from(plaintext, 'utf8'), key)
            const ciphertext2 = EncryptionUtil.encrypt(Buffer.from(plaintext, 'utf8'), key)
            expect(ciphertext1.slice(0, 32)).not.toStrictEqual(ciphertext2.slice(0, 32))
            expect(ciphertext1.slice(32)).not.toStrictEqual(ciphertext2.slice(32))
        })

        it('StreamMessage gets encrypted', () => {
            const key = GroupKey.generate()
            const streamMessage = new StreamMessage({
                messageId: new MessageID('streamId', 0, 1, 0, 'publisherId', 'msgChainId'),
                content: {
                    foo: 'bar',
                },
                contentType: StreamMessage.CONTENT_TYPES.JSON,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                signature: null,
            })
            EncryptionUtil.encryptStreamMessage(streamMessage, key)
            expect(streamMessage.getSerializedContent()).not.toStrictEqual('{"foo":"bar"}')
            expect(streamMessage.encryptionType).toStrictEqual(StreamMessage.ENCRYPTION_TYPES.AES)
        })

        it('StreamMessage decryption after encryption equals the initial StreamMessage', () => {
            const key = GroupKey.generate()
            const streamMessage = new StreamMessage({
                messageId: new MessageID('streamId', 0, 1, 0, 'publisherId', 'msgChainId'),
                content: {
                    foo: 'bar',
                },
                contentType: StreamMessage.CONTENT_TYPES.JSON,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
                signature: null,
            })
            EncryptionUtil.encryptStreamMessage(streamMessage, key)
            const newKey = EncryptionUtil.decryptStreamMessage(streamMessage, key)
            expect(newKey).toBe(null)
            expect(streamMessage.getSerializedContent()).toStrictEqual('{"foo":"bar"}')
            expect(streamMessage.encryptionType).toStrictEqual(StreamMessage.ENCRYPTION_TYPES.NONE)
        })

        it('throws if invalid public key passed in the constructor', () => {
            const keys = crypto.generateKeyPairSync('rsa', {
                modulusLength: 4096,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem',
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem',
                },
            })
            expect(() => {
                // eslint-disable-next-line no-new
                new EncryptionUtil({
                    privateKey: keys.privateKey,
                    publicKey: 'wrong public key',
                })
            }).toThrow()
        })

        it('throws if invalid private key passed in the constructor', () => {
            const keys = crypto.generateKeyPairSync('rsa', {
                modulusLength: 4096,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem',
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem',
                },
            })
            expect(() => {
                // eslint-disable-next-line no-new
                new EncryptionUtil({
                    privateKey: 'wrong private key',
                    publicKey: keys.publicKey,
                })
            }).toThrow()
        })

        it('does not throw if valid key pair passed in the constructor', () => {
            const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
                modulusLength: 4096,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem',
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem',
                },
            })
            // eslint-disable-next-line no-new
            new EncryptionUtil({
                privateKey,
                publicKey,
            })
        })

        describe('GroupKey.validate', () => {
            it('throws if key is the wrong size', () => {
                expect(() => {
                    GroupKey.validate(GroupKey.from(['test', crypto.randomBytes(16)]))
                }).toThrow('size')
            })

            it('throws if key is not a buffer', () => {
                expect(() => {
                    // expected error below is desirable, show typecheks working as intended
                    // @ts-expect-error
                    GroupKey.validate(GroupKey.from(['test', Array.from(crypto.randomBytes(32))]))
                }).toThrow('Buffer')
            })

            it('does not throw with valid values', () => {
                GroupKey.validate(GroupKey.generate())
            })
        })
    })
}

TestEncryptionUtil({
    isBrowser: false,
})

TestEncryptionUtil({
    isBrowser: true,
})
