import { fastWallet } from 'streamr-test-utils'
import { ethers } from 'ethers'
import { EncryptedGroupKey, MessageLayer, toStreamID, toStreamPartID } from 'streamr-client-protocol'
import { GroupKey } from '../../src/encryption/GroupKey'
import { EncryptionUtil } from '../../src/encryption/EncryptionUtil'
import { createMockMessage } from '../test-utils/utils'

const { StreamMessage, MessageID } = MessageLayer

const STREAM_ID = toStreamID('streamId')

describe('EncryptionUtil', () => {
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
        const nextKey = GroupKey.generate()
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
        EncryptionUtil.encryptStreamMessage(streamMessage, key, nextKey)
        expect(streamMessage.getSerializedContent()).not.toStrictEqual('{"foo":"bar"}')
        expect(streamMessage.encryptionType).toStrictEqual(StreamMessage.ENCRYPTION_TYPES.AES)
        expect(streamMessage.groupKeyId).toBe(key.id)
        expect(streamMessage.newGroupKey).toMatchObject({
            groupKeyId: nextKey.id,
            encryptedGroupKeyHex: expect.any(String)
        })
    })

    it('StreamMessage decryption after encryption equals the initial StreamMessage', () => {
        const key = GroupKey.generate()
        const nextKey = GroupKey.generate()
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
        EncryptionUtil.encryptStreamMessage(streamMessage, key, nextKey)
        EncryptionUtil.decryptStreamMessage(streamMessage, key)
        expect(streamMessage.getSerializedContent()).toStrictEqual('{"foo":"bar"}')
        expect(streamMessage.encryptionType).toStrictEqual(StreamMessage.ENCRYPTION_TYPES.NONE)
        expect(streamMessage.groupKeyId).toBe(key.id)
        expect(streamMessage.newGroupKey).toEqual(nextKey)
    })

    it('StreamMessage decryption throws if newGroupKey invalid', () => {
        const key = GroupKey.generate()
        const msg = createMockMessage({
            publisher: fastWallet(),
            streamPartId: toStreamPartID(STREAM_ID, 0),
            encryptionKey: key
        })
        msg.newGroupKey = {
            groupKeyId: 'mockId',
            encryptedGroupKeyHex: '0x1234',
            serialized: ''
        } as EncryptedGroupKey
        expect(() => EncryptionUtil.decryptStreamMessage(msg, key)).toThrow('Could not decrypt new group key')
    })
})
