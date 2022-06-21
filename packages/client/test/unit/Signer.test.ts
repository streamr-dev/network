import 'reflect-metadata'
import { StreamMessage, MessageID, MessageRef, StreamID, toStreamID, SigningUtil } from 'streamr-client-protocol'

import { computeAddress } from '@ethersproject/transactions'
import { getAddress } from '@ethersproject/address'
import { Signer } from '../../src/publish/Signer'
import { createAuthentication } from '../../src/Authentication'

/*
The StreamrClient accepts private keys with or without the '0x' prefix and adds the prefix if it's absent. Since
we are testing the Signer which is internal, we use private keys with the '0x' prefix.
 */
describe('Signer', () => {
    describe('construction', () => {
        it('Should return a Signer when set with private key', () => {
            const signer = new Signer(createAuthentication({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, undefined as any))
            expect(signer).toBeInstanceOf(Signer)
        })
    })

    describe('signing', () => {
        let signer: Signer
        const streamId: StreamID = toStreamID('streamId')
        const data = {
            field: 'some-data',
        }
        const timestamp = 1529549961116
        const privateKey = '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709'

        beforeEach(() => {
            signer = new Signer(createAuthentication({
                privateKey
            }, undefined as any))
        })

        it('should sign with null previous ref correctly', async () => {
            const address = getAddress(computeAddress(privateKey)).toLowerCase()
            const streamMessage = new StreamMessage({
                messageId: new MessageID(streamId, 0, timestamp, 0, address, 'chain-id'),
                prevMsgRef: null,
                content: data,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: null
            })
            const payload = streamMessage.getStreamId() + streamMessage.getStreamPartition() + streamMessage.getTimestamp()
                + streamMessage.messageId.sequenceNumber + address.toLowerCase() + streamMessage.messageId.msgChainId
                + streamMessage.getSerializedContent()

            const expectedSignature = SigningUtil.sign(payload, privateKey)
            await signer.sign(streamMessage)
            expect(streamMessage.signature).toBe(expectedSignature)
            expect(streamMessage.getPublisherId()).toBe(address)
            expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
        })

        it('should sign with non-null previous ref correctly', async () => {
            const address = getAddress(computeAddress(privateKey)).toLowerCase()
            const streamMessage = new StreamMessage({
                messageId: new MessageID(streamId, 0, timestamp, 0, address, 'chain-id'),
                prevMsgRef: new MessageRef(timestamp - 10, 0),
                content: data,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: null
            })
            const payload = [
                streamMessage.getStreamId(), streamMessage.getStreamPartition(), streamMessage.getTimestamp(),
                streamMessage.messageId.sequenceNumber, address.toLowerCase(), streamMessage.messageId.msgChainId,
                streamMessage.prevMsgRef!.timestamp, streamMessage.prevMsgRef!.sequenceNumber, streamMessage.getSerializedContent()
            ]
            const expectedSignature = SigningUtil.sign(payload.join(''), privateKey)
            expect(payload.join('')).toEqual(streamMessage.getPayloadToSign())
            await signer.sign(streamMessage)
            expect(streamMessage.signature).toBe(expectedSignature)
            expect(streamMessage.getPublisherId()).toBe(address)
            expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
        })

        it('signing should throw when constructed with no auth', async () => {
            signer = new Signer(createAuthentication({}, undefined as any))
            const address = getAddress(computeAddress(privateKey)).toLowerCase()
            const streamMessage = new StreamMessage({
                messageId: new MessageID(streamId, 0, timestamp, 0, address, 'chain-id'),
                prevMsgRef: new MessageRef(timestamp - 10, 0),
                content: data,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: null
            })
            await expect(async () => {
                await signer.sign(streamMessage)
            }).rejects.toThrow('privateKey')
        })
    })
})
