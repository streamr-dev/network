import { fastWallet } from '@streamr/test-utils'
import { StreamPartIDUtils, hexToBinary, toStreamID, toStreamPartID, utf8ToBinary } from '@streamr/utils'
import { EncryptionUtil, INITIALIZATION_VECTOR_LENGTH } from '../../src/encryption/EncryptionUtil'
import { GroupKey } from '../../src/encryption/GroupKey'
import { createMockMessage } from '../test-utils/utils'
import { EncryptedGroupKey } from './../../src/protocol/EncryptedGroupKey'
import { StreamMessage, StreamMessageAESEncrypted } from './../../src/protocol/StreamMessage'
import { StreamrClientError } from '../../src/StreamrClientError'

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
        expect(cipher1.slice(0, INITIALIZATION_VECTOR_LENGTH)).not.toStrictEqual(
            cipher2.slice(0, INITIALIZATION_VECTOR_LENGTH)
        )
        expect(cipher1.slice(INITIALIZATION_VECTOR_LENGTH)).not.toStrictEqual(
            cipher2.slice(INITIALIZATION_VECTOR_LENGTH)
        )
    })

    it('StreamMessage decryption: happy path', async () => {
        const key = GroupKey.generate()
        const nextKey = GroupKey.generate()
        const streamMessage = (await createMockMessage({
            streamPartId: StreamPartIDUtils.parse('stream#0'),
            publisher: fastWallet(),
            content: {
                foo: 'bar'
            },
            encryptionKey: key,
            nextEncryptionKey: nextKey
        })) as StreamMessageAESEncrypted
        const [content, newGroupKey] = EncryptionUtil.decryptStreamMessage(streamMessage, key)
        expect(content).toEqualBinary(utf8ToBinary('{"foo":"bar"}'))
        expect(newGroupKey).toEqual(nextKey)
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
        }) as StreamMessageAESEncrypted
        expect(() => EncryptionUtil.decryptStreamMessage(msg2, key)).toThrowStreamrClientError(
            new StreamrClientError('Could not decrypt new encryption key', 'DECRYPT_ERROR', msg2)
        )
    })
})
