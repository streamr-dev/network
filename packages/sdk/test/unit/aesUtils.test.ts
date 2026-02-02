import { createTestWallet } from '@streamr/test-utils'
import { StreamPartIDUtils, utf8ToBinary } from '@streamr/utils'
import { decryptWithAES, encryptWithAES, INITIALIZATION_VECTOR_LENGTH } from '../../src/encryption/aesUtils'
import { decryptStreamMessageContent } from '../../src/encryption/encryptionUtils'
import { GroupKey } from '../../src/encryption/GroupKey'
import { createMockMessage } from '../test-utils/utils'
import { StreamMessageAESEncrypted } from './../../src/protocol/StreamMessage'

describe('aesUtils', () => {

    const plaintext = Buffer.from('some random text', 'utf8')

    describe('encryptWithAES / decryptWithAES', () => {
        it('returns a ciphertext which is different from the plaintext', () => {
            const key = GroupKey.generate()
            const ciphertext = encryptWithAES(plaintext, key.data)
            expect(ciphertext).not.toStrictEqual(plaintext)
        })

        it('returns the initial plaintext after decrypting the ciphertext', () => {
            const key = GroupKey.generate()
            const ciphertext = encryptWithAES(plaintext, key.data)
            expect(decryptWithAES(ciphertext, key.data)).toEqualBinary(plaintext)
        })
    
        it('preserves size (plaintext + iv)', () => {
            const key = GroupKey.generate()
            const ciphertext = encryptWithAES(plaintext, key.data)
            expect(ciphertext.length).toStrictEqual(plaintext.length + INITIALIZATION_VECTOR_LENGTH)
        })
    
        it('produces different ivs and ciphertexts upon multiple encrypt() calls', () => {
            const key = GroupKey.generate()
            const cipher1 = encryptWithAES(plaintext, key.data)
            const cipher2 = encryptWithAES(plaintext, key.data)
            expect(cipher1.slice(0, INITIALIZATION_VECTOR_LENGTH)).not.toStrictEqual(cipher2.slice(0, INITIALIZATION_VECTOR_LENGTH))
            expect(cipher1.slice(INITIALIZATION_VECTOR_LENGTH)).not.toStrictEqual(cipher2.slice(INITIALIZATION_VECTOR_LENGTH))
        })
    })
    
    describe('decryptStreamMessageContent', () => {
        it('decrypts content and new group key', async () => {
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
            const result = decryptStreamMessageContent(streamMessage.content, key.data, streamMessage.newGroupKey)
            expect(result.content).toEqualBinary(utf8ToBinary('{"foo":"bar"}'))
            const newGroupKey = result.newGroupKey 
                ? new GroupKey(result.newGroupKey.id, Buffer.from(result.newGroupKey.data))
                : undefined
            expect(newGroupKey).toEqual(nextKey)
        })
    
        it('throws if newGroupKey data is invalid', async () => {
            const key = GroupKey.generate()
            const streamMessage = await createMockMessage({
                streamPartId: StreamPartIDUtils.parse('stream#0'),
                publisher: await createTestWallet(),
                content: { foo: 'bar' },
                encryptionKey: key
            }) as StreamMessageAESEncrypted
            // Provide an invalid encrypted group key (too short to contain valid AES data)
            const invalidNewGroupKey = { id: 'mockId', data: new Uint8Array([1, 2, 3, 4]) }
            // decryptStreamMessageContent uses Node's crypto which throws on invalid cipher data
            expect(() => decryptStreamMessageContent(
                streamMessage.content, 
                key.data, 
                invalidNewGroupKey
            )).toThrow()
        })
    })
})
