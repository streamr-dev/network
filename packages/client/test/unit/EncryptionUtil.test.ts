import {
    EncryptedGroupKey,
    EncryptionType,
    StreamMessage,
    StreamPartIDUtils,
    toStreamID,
    toStreamPartID
} from '@streamr/protocol'
import { fastWallet } from '@streamr/test-utils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { EncryptionUtil, INITIALIZATION_VECTOR_LENGTH } from '../../src/encryption/EncryptionUtil'
import { createMockMessage } from '../test-utils/utils'
import { hexToBinary, binaryToUtf8 } from '@streamr/utils'

const STREAM_ID = toStreamID('streamId')

describe('EncryptionUtil', () => {
    it('aes decryption after encryption equals the initial plaintext', () => {
        const key = GroupKey.generate()
        const plaintext = 'some random text'
        const ciphertext = EncryptionUtil.encryptWithAES(Buffer.from(plaintext, 'utf8'), key.data)
        expect(EncryptionUtil.decryptWithAES(ciphertext, key.data).toString('utf8')).toStrictEqual(plaintext)
    })

    it('aes encryption preserves size (plus iv)', () => {
        const key = GroupKey.generate()
        const plaintext = 'some random text'
        const plaintextBuffer = Buffer.from(plaintext, 'utf8')
        const ciphertext = EncryptionUtil.encryptWithAES(plaintextBuffer, key.data)
        expect(ciphertext.length).toStrictEqual(plaintextBuffer.length + INITIALIZATION_VECTOR_LENGTH)
    })

    it('multiple same encrypt() calls use different ivs and produce different ciphertexts', () => {
        const key = GroupKey.generate()
        const plaintext = 'some random text'
        const cipher1 = EncryptionUtil.encryptWithAES(Buffer.from(plaintext, 'utf8'), key.data)
        const cipher2 = EncryptionUtil.encryptWithAES(Buffer.from(plaintext, 'utf8'), key.data)
        expect(cipher1.slice(0, INITIALIZATION_VECTOR_LENGTH)).not.toStrictEqual(cipher2.slice(0, INITIALIZATION_VECTOR_LENGTH))
        expect(cipher1.slice(INITIALIZATION_VECTOR_LENGTH)).not.toStrictEqual(cipher2.slice(INITIALIZATION_VECTOR_LENGTH))
    })

    it('StreamMessage decryption: happy path', async () => {
        const key = GroupKey.generate()
        const nextKey = GroupKey.generate()
        const streamMessage = await createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: fastWallet(),
            content: {
                foo: 'bar'
            },
            encryptionKey: key,
            nextEncryptionKey: nextKey
        })
        const decryptedStreamMessage = EncryptionUtil.decryptStreamMessage(streamMessage, key)
        // Coparing this way as jest does not like comparing buffers to Uint8Arrays
        expect(binaryToUtf8(decryptedStreamMessage.content)).toStrictEqual('{"foo":"bar"}')
        expect(decryptedStreamMessage.encryptionType).toStrictEqual(EncryptionType.NONE)
        expect(decryptedStreamMessage.groupKeyId).toBe(key.id)
        expect(decryptedStreamMessage.newGroupKey).toEqual(nextKey.toEncryptedGroupKey())
    })

    it('StreamMessage decryption throws if newGroupKey invalid', async () => {
        const key = GroupKey.generate()
        const msg = await createMockMessage({
            publisher: fastWallet(),
            streamPartId: toStreamPartID(STREAM_ID, 0),
            encryptionKey: key
        })
        const msg2 = new StreamMessage({
            ...msg,
            newGroupKey: new EncryptedGroupKey('mockId', hexToBinary('0x1234'))
        })
        expect(() => EncryptionUtil.decryptStreamMessage(msg2, key)).toThrow('Could not decrypt new group key')
    })
})
