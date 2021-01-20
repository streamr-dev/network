import { MessageLayer } from 'streamr-client-protocol'

import Signer from '../../src/Signer'

const { StreamMessage, MessageID, MessageRef } = MessageLayer
/*
The StreamrClient accepts private keys with or without the '0x' prefix and adds the prefix if it's absent. Since
we are testing the Signer which is internal, we use private keys with the '0x' prefix.
 */
describe('Signer', () => {
    describe('construction', () => {
        it('should sign when constructed with private key', async () => {
            const signer = new Signer({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
            const signature = signer.signData('some-data')
            expect(signature).toBeTruthy()
        })

        it('should throw when constructed with nothing', () => {
            expect(() => {
                // eslint-disable-next-line no-new
                new Signer({})
            }).toThrow()
        })

        it('Should return undefined when "never" option is set', () => {
            expect(Signer.createSigner({}, 'never')).toBe(undefined)
        })

        it('Should return undefined when "auto" option is set with no private key or provider', () => {
            expect(Signer.createSigner({}, 'auto')).toBe(undefined)
        })

        it('Should return a Signer when "auto" option is set with private key', () => {
            const signer = Signer.createSigner({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'auto')
            expect(signer instanceof Signer).toBeTruthy()
        })

        it('Should return a Signer when "always" option is set with private key', () => {
            const signer = Signer.createSigner({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'always')
            expect(signer instanceof Signer).toBeTruthy()
        })

        it('Should throw when "always" option is set with no private key or provider', () => {
            expect(() => Signer.createSigner({}, 'always')).toThrow()
        })

        it('Should throw when unknown option is set', () => {
            expect(() => Signer.createSigner({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'unknown')).toThrow()
        })
    })

    describe('signing', () => {
        let signer
        const streamId = 'streamId'
        const data = {
            field: 'some-data',
        }
        const timestamp = 1529549961116

        beforeEach(() => {
            signer = new Signer({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
        })

        it('should return correct signature', async () => {
            const payload = 'data-to-sign'
            const signature = await signer.signData(payload)
            expect(signature).toEqual('0x084b3ac0f2ad17d387ca5bbf5d72d8f1dfd1b372e399ce6b0bfc60793e'
                + 'b717d2431e498294f202d8dfd9f56158391d453c018470aea92ed6a80a23c20ab6f7ac1b')
        })

        it('should sign StreamMessageV31 with null previous ref correctly', async () => {
            const streamMessage = new StreamMessage({
                messageId: new MessageID(streamId, 0, timestamp, 0, await signer.getAddress(), 'chain-id'),
                prevMsgRef: null,
                content: data,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: null
            })
            const payload = streamMessage.getStreamId() + streamMessage.getStreamPartition() + streamMessage.getTimestamp()
                + streamMessage.messageId.sequenceNumber + (await signer.getAddress()).toLowerCase() + streamMessage.messageId.msgChainId
                + streamMessage.getSerializedContent()

            const expectedSignature = await signer.signData(payload)
            await signer.signStreamMessage(streamMessage)
            expect(streamMessage.signature).toBe(expectedSignature)
            expect(streamMessage.getPublisherId()).toBe(await signer.getAddress())
            expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
        })

        it('should sign StreamMessageV31 with non-null previous ref correctly', async () => {
            const streamMessage = new StreamMessage({
                version: 31,
                messageId: new MessageID(streamId, 0, timestamp, 0, await signer.getAddress(), 'chain-id'),
                prevMsgRef: new MessageRef(timestamp - 10, 0),
                content: data,
                encryptionType: StreamMessage.ENCRYPTION_TYPES.NONE,
                signatureType: StreamMessage.SIGNATURE_TYPES.ETH,
                signature: null
            })
            const payload = [
                streamMessage.getStreamId(), streamMessage.getStreamPartition(), streamMessage.getTimestamp(),
                streamMessage.messageId.sequenceNumber, (await signer.getAddress()).toLowerCase(), streamMessage.messageId.msgChainId,
                streamMessage.prevMsgRef.timestamp, streamMessage.prevMsgRef.sequenceNumber, streamMessage.getSerializedContent()
            ]
            const expectedSignature = await signer.signData(payload.join(''))
            expect(payload.join('')).toEqual(streamMessage.getPayloadToSign())
            expect(expectedSignature).toEqual(await signer.signData(streamMessage.getPayloadToSign()))
            await signer.signStreamMessage(streamMessage)
            expect(streamMessage.signature).toBe(expectedSignature)
            expect(streamMessage.getPublisherId()).toBe(await signer.getAddress())
            expect(streamMessage.signatureType).toBe(StreamMessage.SIGNATURE_TYPES.ETH)
        })
    })
})
