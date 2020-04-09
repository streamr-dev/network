import assert from 'assert'
import crypto from 'crypto'

import { ethers } from 'ethers'
import { MessageLayer } from 'streamr-client-protocol'

import EncryptionUtil from '../../src/EncryptionUtil'

const { StreamMessage } = MessageLayer

// wrap these tests so can run same tests as if in browser
function TestEncryptionUtil({ isBrowser = false } = {}) {
    describe(`EncryptionUtil ${isBrowser ? 'Browser' : 'Server'}`, () => {
        beforeAll(() => {
            // this is the toggle used in EncryptionUtil to
            // use the webcrypto apis
            process.browser = !!isBrowser
        })
        afterAll(() => {
            process.browser = !isBrowser
        })

        it('rsa decryption after encryption equals the initial plaintext', async () => {
            const encryptionUtil = new EncryptionUtil()
            await encryptionUtil.onReady()
            const plaintext = 'some random text'
            const ciphertext = EncryptionUtil.encryptWithPublicKey(Buffer.from(plaintext, 'utf8'), encryptionUtil.getPublicKey())
            expect(encryptionUtil.decryptWithPrivateKey(ciphertext).toString('utf8')).toStrictEqual(plaintext)
        })
        it('rsa decryption after encryption equals the initial plaintext (hex strings)', async () => {
            const encryptionUtil = new EncryptionUtil()
            await encryptionUtil.onReady()
            const plaintext = 'some random text'
            const ciphertext = EncryptionUtil.encryptWithPublicKey(Buffer.from(plaintext, 'utf8'), encryptionUtil.getPublicKey(), true)
            expect(encryptionUtil.decryptWithPrivateKey(ciphertext, true).toString('utf8')).toStrictEqual(plaintext)
        })
        it('aes decryption after encryption equals the initial plaintext', () => {
            const key = crypto.randomBytes(32)
            const plaintext = 'some random text'
            const ciphertext = EncryptionUtil.encrypt(Buffer.from(plaintext, 'utf8'), key)
            expect(EncryptionUtil.decrypt(ciphertext, key).toString('utf8')).toStrictEqual(plaintext)
        })
        it('aes encryption preserves size (plus iv)', () => {
            const key = crypto.randomBytes(32)
            const plaintext = 'some random text'
            const plaintextBuffer = Buffer.from(plaintext, 'utf8')
            const ciphertext = EncryptionUtil.encrypt(plaintextBuffer, key)
            const ciphertextBuffer = ethers.utils.arrayify(`0x${ciphertext}`)
            expect(ciphertextBuffer.length).toStrictEqual(plaintextBuffer.length + 16)
        })
        it('multiple same encrypt() calls use different ivs and produce different ciphertexts', () => {
            const key = crypto.randomBytes(32)
            const plaintext = 'some random text'
            const ciphertext1 = EncryptionUtil.encrypt(Buffer.from(plaintext, 'utf8'), key)
            const ciphertext2 = EncryptionUtil.encrypt(Buffer.from(plaintext, 'utf8'), key)
            expect(ciphertext1.slice(0, 32)).not.toStrictEqual(ciphertext2.slice(0, 32))
            expect(ciphertext1.slice(32)).not.toStrictEqual(ciphertext2.slice(32))
        })
        it('StreamMessage gets encrypted', () => {
            const key = crypto.randomBytes(32)
            const streamMessage = StreamMessage.create(
                ['streamId', 0, 1, 0, 'publisherId', 'msgChainId'], null,
                StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    foo: 'bar'
                }, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            EncryptionUtil.encryptStreamMessage(streamMessage, key)
            expect(streamMessage.getSerializedContent()).not.toStrictEqual('{"foo":"bar"}')
            expect(streamMessage.encryptionType).toStrictEqual(StreamMessage.ENCRYPTION_TYPES.AES)
        })
        it('StreamMessage decryption after encryption equals the initial StreamMessage', () => {
            const key = crypto.randomBytes(32)
            const streamMessage = StreamMessage.create(
                ['streamId', 0, 1, 0, 'publisherId', 'msgChainId'], null,
                StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    foo: 'bar'
                }, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            EncryptionUtil.encryptStreamMessage(streamMessage, key)
            const newKey = EncryptionUtil.decryptStreamMessage(streamMessage, key)
            expect(newKey).toBe(null)
            expect(streamMessage.getSerializedContent()).toStrictEqual('{"foo":"bar"}')
            expect(streamMessage.encryptionType).toStrictEqual(StreamMessage.ENCRYPTION_TYPES.NONE)
        })
        it('StreamMessage gets encrypted with new key', () => {
            const key = crypto.randomBytes(32)
            const newKey = crypto.randomBytes(32)
            const streamMessage = StreamMessage.create(
                ['streamId', 0, 1, 0, 'publisherId', 'msgChainId'], null,
                StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    foo: 'bar'
                }, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            EncryptionUtil.encryptStreamMessageAndNewKey(newKey, streamMessage, key)
            expect(streamMessage.getSerializedContent()).not.toStrictEqual('{"foo":"bar"}')
            expect(streamMessage.encryptionType).toStrictEqual(StreamMessage.ENCRYPTION_TYPES.NEW_KEY_AND_AES)
        })
        it('StreamMessage decryption after encryption equals the initial StreamMessage (with new key)', () => {
            const key = crypto.randomBytes(32)
            const newKey = crypto.randomBytes(32)
            const streamMessage = StreamMessage.create(
                ['streamId', 0, 1, 0, 'publisherId', 'msgChainId'], null,
                StreamMessage.CONTENT_TYPES.MESSAGE, StreamMessage.ENCRYPTION_TYPES.NONE, {
                    foo: 'bar'
                }, StreamMessage.SIGNATURE_TYPES.NONE, null,
            )
            EncryptionUtil.encryptStreamMessageAndNewKey(newKey, streamMessage, key)
            const newKeyReceived = EncryptionUtil.decryptStreamMessage(streamMessage, key)
            expect(newKeyReceived).toStrictEqual(newKey)
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
            assert.throws(() => {
                // eslint-disable-next-line no-new
                new EncryptionUtil({
                    privateKey: keys.privateKey,
                    publicKey: 'wrong public key',
                })
            }, /Error: "publicKey" must be a PKCS#8 RSA public key as a string in the PEM format/)
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
            assert.throws(() => {
                // eslint-disable-next-line no-new
                new EncryptionUtil({
                    privateKey: 'wrong private key',
                    publicKey: keys.publicKey,
                })
            }, /Error: "privateKey" must be a PKCS#8 RSA public key as a string in the PEM format/)
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
        it('validateGroupKey() throws if key is the wrong size', () => {
            assert.throws(() => {
                EncryptionUtil.validateGroupKey(crypto.randomBytes(16))
            }, /Error: Group key must have a size of 256 bits/)
        })
        it('validateGroupKey() throws if key is not a buffer', () => {
            assert.throws(() => {
                EncryptionUtil.validateGroupKey(ethers.utils.hexlify(crypto.randomBytes(32)))
            }, /Error: Group key must be a Buffer/)
        })
        it('validateGroupKey() does not throw', () => {
            EncryptionUtil.validateGroupKey(crypto.randomBytes(32))
        })
    })
}

TestEncryptionUtil({
    isBrowser: false,
})

TestEncryptionUtil({
    isBrowser: true,
})
