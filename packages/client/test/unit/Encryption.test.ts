import crypto from 'crypto'

import { ethers } from 'ethers'
import { MessageLayer, toStreamID } from 'streamr-client-protocol'

import { GroupKey } from '../../src/encryption/GroupKey'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { RsaKeyPair } from '../../src/encryption/RsaKeyPair'

const { StreamMessage, MessageID } = MessageLayer

const STREAM_ID = toStreamID('streamId')

describe('EncryptionUtil and RsaKeyPair', () => {
    describe('RsaKeyPair instance', () => {
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

    it('aes decryption after encryption equals the initial plaintext', () => {
        const key = GroupKey.generate()
        const plaintext = 'some random text'
        // @ts-expect-error private
        const ciphertext = EncryptionUtil.encrypt(Buffer.from(plaintext, 'utf8'), key)
        // @ts-expect-error private
        expect(EncryptionUtil.decrypt(ciphertext, key).toString('utf8')).toStrictEqual(plaintext)
    })

    it('aes encryption preserves size (plus iv)', () => {
        const key = GroupKey.generate()
        const plaintext = 'some random text'
        const plaintextBuffer = Buffer.from(plaintext, 'utf8')
        // @ts-expect-error private
        const ciphertext = EncryptionUtil.encrypt(plaintextBuffer, key)
        const ciphertextBuffer = ethers.utils.arrayify(`0x${ciphertext}`)
        expect(ciphertextBuffer.length).toStrictEqual(plaintextBuffer.length + 16)
    })

    it('multiple same encrypt() calls use different ivs and produce different ciphertexts', () => {
        const key = GroupKey.generate()
        const plaintext = 'some random text'
        // @ts-expect-error private
        const ciphertext1 = EncryptionUtil.encrypt(Buffer.from(plaintext, 'utf8'), key)
        // @ts-expect-error private
        const ciphertext2 = EncryptionUtil.encrypt(Buffer.from(plaintext, 'utf8'), key)
        expect(ciphertext1.slice(0, 32)).not.toStrictEqual(ciphertext2.slice(0, 32))
        expect(ciphertext1.slice(32)).not.toStrictEqual(ciphertext2.slice(32))
    })

    it('StreamMessage gets encrypted', () => {
        const key = GroupKey.generate()
        const streamMessage = new StreamMessage({
            messageId: new MessageID(STREAM_ID, 0, 1, 0, 'publisherId', 'msgChainId'),
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
            messageId: new MessageID(STREAM_ID, 0, 1, 0, 'publisherId', 'msgChainId'),
            content: {
                foo: 'bar',
            },
            contentType: StreamMessage.CONTENT_TYPES.JSON,
            encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
            signatureType: StreamMessage.SIGNATURE_TYPES.NONE,
            signature: null,
        })
        EncryptionUtil.encryptStreamMessage(streamMessage, key)
        EncryptionUtil.decryptStreamMessage(streamMessage, key)
        expect(streamMessage.getSerializedContent()).toStrictEqual('{"foo":"bar"}')
        expect(streamMessage.encryptionType).toStrictEqual(StreamMessage.ENCRYPTION_TYPES.NONE)
    })

    describe('GroupKey.validate', () => {
        it('throws if key is the wrong size', () => {
            expect(() => {
                GroupKey.validate(GroupKey.from(['test', crypto.randomBytes(16)]))
            }).toThrow('size')
        })

        it('throws if key is not a buffer', () => {
            expect(() => {
                // @ts-expect-error expected error below is desirable, show typecheks working as intended
                GroupKey.validate(GroupKey.from(['test', Array.from(crypto.randomBytes(32))]))
            }).toThrow('Buffer')
        })

        it('does not throw with valid values', () => {
            GroupKey.validate(GroupKey.generate())
        })
    })
})

