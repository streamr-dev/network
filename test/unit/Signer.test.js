import assert from 'assert'
import { PublishRequest, StreamMessage } from 'streamr-client-protocol'
import Signer from '../../src/Signer'

describe('Signer', () => {
    describe('construction', () => {
        it('should sign when constructed with private key', () => {
            const signer = new Signer({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
            const signature = signer.signData('some-data')
            assert(signature)
        })
        it('should throw when constructed with nothing', () => {
            assert.throws(() => {
                // eslint-disable-next-line no-new
                new Signer({})
            }, /Error/)
        })
        it('Should return undefined when "never" option is set', () => {
            assert.strictEqual(Signer.createSigner({}, 'never'), undefined)
        })
        it('Should return undefined when "auto" option is set with no private key or provider', () => {
            assert.strictEqual(Signer.createSigner({}, 'auto'), undefined)
        })
        it('Should return a Signer when "auto" option is set with private key', () => {
            const signer = Signer.createSigner({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'auto')
            assert(signer instanceof Signer)
        })
        it('Should return a Signer when "always" option is set with private key', () => {
            const signer = Signer.createSigner({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'always')
            assert(signer instanceof Signer)
        })
        it('Should throw when "always" option is set with no private key or provider', () => {
            assert.throws(() => Signer.createSigner({}, 'always'), /Error/)
        })
        it('Should throw when unknown option is set', () => {
            assert.throws(() => Signer.createSigner({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'unknown'), /Error/)
        })
    })

    describe('signing', () => {
        let signer
        let request
        let signedRequest
        let signedStreamMessage
        let wrongStreamMessage
        beforeEach(async () => {
            signer = new Signer({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
            const streamId = 'streamId'
            const data = {
                field: 'some-data',
            }
            const timestamp = Date.now()
            request = new PublishRequest(streamId, undefined, undefined, data, timestamp)
            signedRequest = await signer.getSignedPublishRequest(request)
            signedStreamMessage = new StreamMessage(
                streamId, 0, timestamp, 0, 0, 0, StreamMessage.CONTENT_TYPES.JSON,
                data, 1, signedRequest.publisherAddress, signedRequest.signature,
            )
            wrongStreamMessage = new StreamMessage(
                streamId, 0, timestamp, 0, 0, 0, StreamMessage.CONTENT_TYPES.JSON,
                data, 1, signedRequest.publisherAddress,
                '0x3d5c221ebed6bf75ecd0ca8751aa18401ac60561034e3b2889dfd7bbc0a2ff3c5f1' +
                'c5239113f3fac5b648ab665d152ecece1daaafdd3d94309c2b822ec28369e1c',
            )
        })
        it('should return correct signature', async () => {
            const payload = 'data-to-sign'
            const expectedSignature = '0x3d5c221ebed6bf75ecd0ca8751aa18401ac60561034e3b2889dfd7bbc0a2ff3' +
                'c5f1c5239113f3fac5b648ab665d152ecece1daaafdd3d94309c2b822ec28369e1c'
            const signature = await signer.signData(payload)
            assert.deepEqual(signature, expectedSignature)
        })
        it('should sign PublishRequest with appropriate fields', async () => {
            const expectedPayload = request.streamId + request.getTimestampAsNumber() + signer.address.toLowerCase() + request.getSerializedContent()
            const payload = Signer.getPayloadToSign(request.streamId, request.getTimestampAsNumber(), signer.address, request.getSerializedContent())
            assert.strictEqual(payload, expectedPayload)
            const signature = await signer.signData(payload)
            assert.deepEqual(signer.address, signedRequest.publisherAddress)
            assert.deepEqual(1, signedRequest.signatureType)
            assert.deepEqual(signature, signedRequest.signature)
        })
        it('Should verify correct signature', () => {
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage, new Set([signedRequest.publisherAddress.toLowerCase()])), true)
        })

        it('Should return false if incorrect signature', () => {
            assert.strictEqual(Signer.verifyStreamMessage(wrongStreamMessage, new Set([signedRequest.publisherAddress.toLowerCase()])), false)
        })

        it('Should return false if correct signature but not from a trusted publisher', () => {
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage, new Set()), false)
        })
    })
})
