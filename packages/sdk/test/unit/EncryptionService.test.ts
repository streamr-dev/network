import { utf8ToBinary } from '@streamr/utils'
import { EncryptionService } from '../../src/encryption/EncryptionService'
import { GroupKey } from '../../src/encryption/GroupKey'
import { DestroySignal } from '../../src/DestroySignal'
import { StreamrClientError } from '../../src/StreamrClientError'

describe('EncryptionService', () => {

    let encryptionService: EncryptionService
    let destroySignal: DestroySignal

    beforeEach(() => {
        destroySignal = new DestroySignal()
        encryptionService = new EncryptionService(destroySignal)
    })

    afterEach(() => {
        encryptionService.destroy()
    })

    describe('encryptWithAES / decryptWithAES', () => {
        it('encrypts and decrypts data correctly', async () => {
            const plaintextOriginal = utf8ToBinary('hello world')
            const key = GroupKey.generate()

            // Make a copy since the original will be transferred
            const ciphertext = await encryptionService.encryptWithAES(
                Uint8Array.from(plaintextOriginal), 
                key.data
            )
            
            expect(ciphertext).not.toStrictEqual(plaintextOriginal)
            expect(ciphertext.length).toBeGreaterThan(plaintextOriginal.length)

            const decrypted = await encryptionService.decryptWithAES(ciphertext, key.data)
            
            expect(decrypted).toStrictEqual(plaintextOriginal)
        })

        it('produces different ciphertexts for same plaintext (due to random IV)', async () => {
            const plaintext = utf8ToBinary('hello world')
            const key = GroupKey.generate()

            const cipher1 = await encryptionService.encryptWithAES(Uint8Array.from(plaintext), key.data)
            const cipher2 = await encryptionService.encryptWithAES(Uint8Array.from(plaintext), key.data)

            expect(cipher1).not.toStrictEqual(cipher2)
        })

        it('handles empty data', async () => {
            const plaintextOriginal = new Uint8Array(0)
            const key = GroupKey.generate()

            const ciphertext = await encryptionService.encryptWithAES(
                Uint8Array.from(plaintextOriginal), 
                key.data
            )
            const decrypted = await encryptionService.decryptWithAES(ciphertext, key.data)

            expect(decrypted).toStrictEqual(plaintextOriginal)
        })

        it('handles large data', async () => {
            const plaintextOriginal = new Uint8Array(100000).fill(42)
            const key = GroupKey.generate()

            const ciphertext = await encryptionService.encryptWithAES(
                Uint8Array.from(plaintextOriginal), 
                key.data
            )
            const decrypted = await encryptionService.decryptWithAES(ciphertext, key.data)

            expect(decrypted).toStrictEqual(plaintextOriginal)
        })
    })

    describe('encryptNextGroupKey / decryptNextGroupKey', () => {
        it('encrypts and decrypts group key correctly', async () => {
            const currentKey = GroupKey.generate()
            const nextKey = GroupKey.generate()

            const encrypted = await encryptionService.encryptNextGroupKey(currentKey, nextKey)
            
            expect(encrypted.id).toBe(nextKey.id)
            expect(encrypted.data).not.toStrictEqual(nextKey.data)

            const decrypted = await encryptionService.decryptNextGroupKey(currentKey, encrypted)
            
            expect(decrypted.id).toBe(nextKey.id)
            expect(decrypted.data).toStrictEqual(nextKey.data)
        })

        it('produces different ciphertexts for same key (due to random IV)', async () => {
            const currentKey = GroupKey.generate()
            const nextKey = GroupKey.generate()

            const encrypted1 = await encryptionService.encryptNextGroupKey(currentKey, nextKey)
            const encrypted2 = await encryptionService.encryptNextGroupKey(currentKey, nextKey)

            expect(encrypted1.data).not.toStrictEqual(encrypted2.data)
        })
    })

    describe('decryptStreamMessage', () => {
        it('decrypts content without new group key', async () => {
            const groupKey = GroupKey.generate()
            const plaintextOriginal = utf8ToBinary('{"message": "hello"}')

            const ciphertext = await encryptionService.encryptWithAES(
                Uint8Array.from(plaintextOriginal), 
                groupKey.data
            )

            const [decryptedContent, newGroupKey] = await encryptionService.decryptStreamMessage(
                ciphertext,
                groupKey
            )

            expect(decryptedContent).toStrictEqual(plaintextOriginal)
            expect(newGroupKey).toBeUndefined()
        })

        it('decrypts content with new group key', async () => {
            const currentKey = GroupKey.generate()
            const nextKey = GroupKey.generate()
            const plaintextOriginal = utf8ToBinary('{"message": "hello"}')

            const ciphertext = await encryptionService.encryptWithAES(
                Uint8Array.from(plaintextOriginal), 
                currentKey.data
            )
            const encryptedNextKey = await encryptionService.encryptNextGroupKey(currentKey, nextKey)

            const [decryptedContent, decryptedNewGroupKey] = await encryptionService.decryptStreamMessage(
                ciphertext,
                currentKey,
                encryptedNextKey
            )

            expect(decryptedContent).toStrictEqual(plaintextOriginal)
            expect(decryptedNewGroupKey).toBeDefined()
            expect(decryptedNewGroupKey!.id).toBe(nextKey.id)
            expect(decryptedNewGroupKey!.data).toStrictEqual(nextKey.data)
        })

        it('throws StreamrClientError on invalid encrypted content', async () => {
            const groupKey = GroupKey.generate()
            // Content that's too short to contain valid IV + ciphertext
            const invalidContent = new Uint8Array([1, 2, 3])

            await expect(encryptionService.decryptStreamMessage(invalidContent, groupKey))
                .rejects
                .toThrow(StreamrClientError)
        })
    })

    describe('lifecycle', () => {
        it('cleans up worker on destroy', async () => {
            const plaintext = utf8ToBinary('test')
            const key = GroupKey.generate()

            // First encrypt to ensure worker is created
            await encryptionService.encryptWithAES(Uint8Array.from(plaintext), key.data)

            // Destroy should not throw
            expect(() => encryptionService.destroy()).not.toThrow()

            // Calling destroy again should be safe (idempotent)
            expect(() => encryptionService.destroy()).not.toThrow()
        })

        it('cleans up via DestroySignal', async () => {
            const plaintext = utf8ToBinary('test')
            const key = GroupKey.generate()

            await encryptionService.encryptWithAES(Uint8Array.from(plaintext), key.data)

            // Trigger destroy via signal - should not throw
            await destroySignal.destroy()
        })

        it('lazily initializes worker on first use', async () => {
            // Create a new service but don't use it yet
            const signal = new DestroySignal()
            const service = new EncryptionService(signal)

            // Destroy without using - should not throw
            expect(() => service.destroy()).not.toThrow()
        })
    })

    describe('sequential operations', () => {
        it('can perform multiple operations sequentially', async () => {
            const key = GroupKey.generate()
            const results: Uint8Array[] = []

            for (let i = 0; i < 5; i++) {
                const plaintext = utf8ToBinary(`message ${i}`)
                const ciphertext = await encryptionService.encryptWithAES(
                    Uint8Array.from(plaintext), 
                    key.data
                )
                const decrypted = await encryptionService.decryptWithAES(ciphertext, key.data)
                results.push(decrypted)
            }

            expect(results).toHaveLength(5)
            for (let i = 0; i < 5; i++) {
                expect(results[i]).toStrictEqual(utf8ToBinary(`message ${i}`))
            }
        })
    })
})
