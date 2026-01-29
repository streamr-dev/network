import { toStreamID, utf8ToBinary } from '@streamr/utils'
import { SignatureType } from '@streamr/trackerless-network'
import { SigningService } from '../../src/signature/SigningService'
import { SigningRequest } from '../../src/signature/signingUtils'
import { StreamMessageType } from '../../src/protocol/StreamMessage'
import { EthereumKeyPairIdentity } from '../../src/identity/EthereumKeyPairIdentity'
import { DestroySignal } from '../../src/DestroySignal'
import { createSignaturePayload } from '../../src/signature/createSignaturePayload'
import { EcdsaSecp256k1Evm } from '@streamr/utils'

describe('SigningService', () => {

    let signingService: SigningService
    let destroySignal: DestroySignal

    beforeEach(() => {
        destroySignal = new DestroySignal()
        signingService = new SigningService(destroySignal)
    })

    afterEach(() => {
        signingService.destroy()
    })

    it('signs a message using the worker and produces a valid signature', async () => {
        const identity = EthereumKeyPairIdentity.generate()
        const privateKey = identity.getPrivateKey()
        const publisherId = await identity.getUserId()

        const payloadInput = {
            messageId: {
                streamId: toStreamID('test-stream'),
                streamPartition: 0,
                timestamp: Date.now(),
                sequenceNumber: 0,
                publisherId,
                msgChainId: 'test-chain'
            },
            content: utf8ToBinary(JSON.stringify({ hello: 'world' })),
            messageType: StreamMessageType.MESSAGE
        }

        const request: SigningRequest = {
            payloadInput,
            privateKey,
            signatureType: SignatureType.ECDSA_SECP256K1_EVM
        }

        const result = await signingService.sign(request)

        if (result.type !== 'success') {
            throw new Error(`Expected success but got error: ${result.message}`)
        }
        expect(result.signature).toBeInstanceOf(Uint8Array)
        expect(result.signature.length).toBeGreaterThan(0)

        // Verify the signature is valid by checking it against the payload
        const payload = createSignaturePayload(payloadInput)
        const signingUtil = new EcdsaSecp256k1Evm()
        const isValid = await signingUtil.verifySignature(await identity.getUserIdRaw(), payload, result.signature)
        expect(isValid).toBe(true)
    })

    it('can sign multiple messages sequentially', async () => {
        const identity = EthereumKeyPairIdentity.generate()
        const privateKey = identity.getPrivateKey()
        const publisherId = await identity.getUserId()

        const signatures: Uint8Array[] = []

        for (let i = 0; i < 3; i++) {
            const request: SigningRequest = {
                payloadInput: {
                    messageId: {
                        streamId: toStreamID('test-stream'),
                        streamPartition: 0,
                        timestamp: Date.now() + i,
                        sequenceNumber: i,
                        publisherId,
                        msgChainId: 'test-chain'
                    },
                    content: utf8ToBinary(JSON.stringify({ index: i })),
                    messageType: StreamMessageType.MESSAGE
                },
                privateKey,
                signatureType: SignatureType.ECDSA_SECP256K1_EVM
            }

            const result = await signingService.sign(request)
            if (result.type !== 'success') {
                throw new Error(`Expected success but got error: ${result.message}`)
            }
            signatures.push(result.signature)
        }

        expect(signatures).toHaveLength(3)
        // All signatures should be different (different payloads)
        expect(new Set(signatures.map(s => Buffer.from(s).toString('hex'))).size).toBe(3)
    })

    it('returns error for unsupported signature type', async () => {
        const identity = EthereumKeyPairIdentity.generate()
        const privateKey = identity.getPrivateKey()
        const publisherId = await identity.getUserId()

        const request: SigningRequest = {
            payloadInput: {
                messageId: {
                    streamId: toStreamID('test-stream'),
                    streamPartition: 0,
                    timestamp: Date.now(),
                    sequenceNumber: 0,
                    publisherId,
                    msgChainId: 'test-chain'
                },
                content: utf8ToBinary(JSON.stringify({ hello: 'world' })),
                messageType: StreamMessageType.MESSAGE
            },
            privateKey,
            signatureType: 999 as SignatureType // Invalid signature type
        }

        const result = await signingService.sign(request)

        if (result.type !== 'error') {
            throw new Error('Expected error but got success')
        }
        expect(result.message).toContain('Unsupported signatureType')
    })

    it('cleans up worker on destroy', async () => {
        const identity = EthereumKeyPairIdentity.generate()
        const privateKey = identity.getPrivateKey()
        const publisherId = await identity.getUserId()

        // First sign to ensure worker is created
        const request: SigningRequest = {
            payloadInput: {
                messageId: {
                    streamId: toStreamID('test-stream'),
                    streamPartition: 0,
                    timestamp: Date.now(),
                    sequenceNumber: 0,
                    publisherId,
                    msgChainId: 'test-chain'
                },
                content: utf8ToBinary(JSON.stringify({ hello: 'world' })),
                messageType: StreamMessageType.MESSAGE
            },
            privateKey,
            signatureType: SignatureType.ECDSA_SECP256K1_EVM
        }

        await signingService.sign(request)

        // Destroy should not throw
        expect(() => signingService.destroy()).not.toThrow()

        // Calling destroy again should be safe (idempotent)
        expect(() => signingService.destroy()).not.toThrow()
    })

    it('cleans up via DestroySignal', async () => {
        const identity = EthereumKeyPairIdentity.generate()
        const privateKey = identity.getPrivateKey()
        const publisherId = await identity.getUserId()

        const request: SigningRequest = {
            payloadInput: {
                messageId: {
                    streamId: toStreamID('test-stream'),
                    streamPartition: 0,
                    timestamp: Date.now(),
                    sequenceNumber: 0,
                    publisherId,
                    msgChainId: 'test-chain'
                },
                content: utf8ToBinary(JSON.stringify({ hello: 'world' })),
                messageType: StreamMessageType.MESSAGE
            },
            privateKey,
            signatureType: SignatureType.ECDSA_SECP256K1_EVM
        }

        await signingService.sign(request)

        // Trigger destroy via signal - should not throw
        await destroySignal.destroy()
    })
})
