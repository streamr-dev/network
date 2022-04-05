import 'reflect-metadata'
import { StreamMessage, MessageID, MessageRef, StreamID, toStreamID } from 'streamr-client-protocol'

import { computeAddress } from '@ethersproject/transactions'
import { getAddress } from '@ethersproject/address'
import { Signer } from '../../src/publish/Signer'

/*
The StreamrClient accepts private keys with or without the '0x' prefix and adds the prefix if it's absent. Since
we are testing the Signer which is internal, we use private keys with the '0x' prefix.
 */
describe('Signer', () => {
    describe('construction', () => {
        it('Should return a Signer when set with private key', () => {
            const signer = new Signer({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
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
        const options = {
            privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
        }

        beforeEach(() => {
            signer = new Signer(options)
        })

        it('should return correct signature', async () => {
            const payload = 'data-to-sign'
            const signature = await signer.signData(payload)
            expect(signature).toEqual('0x084b3ac0f2ad17d387ca5bbf5d72d8f1dfd1b372e399ce6b0bfc60793e'
                + 'b717d2431e498294f202d8dfd9f56158391d453c018470aea92ed6a80a23c20ab6f7ac1b')
        })

        it('should sign StreamMessageV31 with null previous ref correctly', async () => {
            const address = getAddress(computeAddress(options.privateKey)).toLowerCase()
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

            const expectedSignature = await signer.signData(payload)
            await signer.sign(streamMessage)
            expect(streamMessage.signature).toBe(expectedSignature)
            expect(streamMessage.getPublisherId()).toBe(address)
            expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
        })

        it('should sign StreamMessageV31 with non-null previous ref correctly', async () => {
            const address = getAddress(computeAddress(options.privateKey)).toLowerCase()
            const streamMessage = new StreamMessage({
                // @ts-expect-error
                version: 31,
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
            const expectedSignature = await signer.signData(payload.join(''))
            expect(payload.join('')).toEqual(streamMessage.getPayloadToSign())
            expect(expectedSignature).toEqual(await signer.signData(streamMessage.getPayloadToSign()))
            await signer.sign(streamMessage)
            expect(streamMessage.signature).toBe(expectedSignature)
            expect(streamMessage.getPublisherId()).toBe(address)
            expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
        })
        it('signing should throw when constructed with no auth', async () => {
            // @ts-expect-error
            signer = new Signer({})
            const address = getAddress(computeAddress(options.privateKey)).toLowerCase()
            const streamMessage = new StreamMessage({
                // @ts-expect-error
                version: 31,
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

            await expect(async () => {
                await signer.signData(payload.join(''))
            }).rejects.toThrow('privateKey')
            await expect(async () => {
                await signer.sign(streamMessage)
            }).rejects.toThrow('privateKey')
        })
    })
})
