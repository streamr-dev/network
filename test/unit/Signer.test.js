import assert from 'assert'
import { MessageLayer } from 'streamr-client-protocol'
import Signer from '../../src/Signer'

const { StreamMessage, StreamMessageV30, StreamMessageV29 } = MessageLayer

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
        const streamId = 'streamId'
        const data = {
            field: 'some-data',
        }
        const timestamp = 1529549961116
        const correctSignatureV29 = '0xf1d6001f0bc603fe9e89b67b0ff3e1a7e8916ea5c8a5228a13ab45f29c0de2' +
            '6c06e711ba0d95129e3c03dbde1c7963dab7978f4e4e6974c70850470f13180ce81b'
        const correctSignatureV30 = '0xe72a5a304014bc5b913a8e2fa2bc8df00afe8947cb9d994a1cc27c6bad61da' +
            '8b2f84f6521340f9724f9175317d69ba50991b919493de1900315f65621598c11a1b'
        const wrongSignature = '0x3d5c221ebed6bf75ecd0ca8751aa18401ac60561034e3b2889dfd7bbc0a2ff3c5f1' +
            'c5239113f3fac5b648ab665d152ecece1daaafdd3d94309c2b822ec28369e1c'
        beforeEach(() => {
            signer = new Signer({
                privateKey: '348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
        })
        it('should return correct signature', async () => {
            const payload = 'data-to-sign'
            const signature = await signer.signData(payload)
            assert.deepEqual(signature, '0x3d5c221ebed6bf75ecd0ca8751aa18401ac60561034e3b2889dfd7bbc0a2ff3' +
                'c5f1c5239113f3fac5b648ab665d152ecece1daaafdd3d94309c2b822ec28369e1c')
        })
        it('should sign StreamMessageV30 correctly', async () => {
            const streamMessage = new StreamMessageV30(
                [streamId, 0, timestamp, 0, '', 'chain-id'], [timestamp - 10, 0], StreamMessage.CONTENT_TYPES.JSON,
                data, StreamMessage.SIGNATURE_TYPES.ETH, null,
            )
            const payload = streamMessage.getStreamId() + streamMessage.getStreamPartition() + streamMessage.getTimestamp() +
                streamMessage.messageId.sequenceNumber + signer.address.toLowerCase() + streamMessage.messageId.msgChainId +
                streamMessage.getSerializedContent()
            const expectedSignature = await signer.signData(payload)
            await signer.signStreamMessage(streamMessage)
            assert.strictEqual(streamMessage.signature, expectedSignature)
            assert.strictEqual(streamMessage.getPublisherId(), signer.address)
            assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
        })
        it('Should verify correct signature (V30)', async () => {
            const signedStreamMessage = new StreamMessageV30(
                [streamId, 0, timestamp, 0, signer.address, 'chain-id'], [timestamp - 10, 0], StreamMessage.CONTENT_TYPES.JSON,
                data, StreamMessage.SIGNATURE_TYPES.ETH, correctSignatureV30,
            )
            await signer.signStreamMessage(signedStreamMessage)
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage, new Set([signer.address.toLowerCase()])), true)
        })
        it('Should verify correct signature (V29 but was converted to v30 for the client)', () => {
            const signedStreamMessage = (new StreamMessageV29(
                streamId, 0, timestamp, 0, 0, 0, StreamMessage.CONTENT_TYPES.JSON,
                data, StreamMessage.SIGNATURE_TYPES.ETH_LEGACY, signer.address, correctSignatureV29,
            )).toOtherVersion(30)
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage, new Set([signer.address.toLowerCase()])), true)
        })
        it('Should return false if incorrect signature (V30)', () => {
            const wrongStreamMessage = new StreamMessageV30(
                [streamId, 0, timestamp, 0, signer.address, ''], [timestamp - 10, 0], StreamMessage.CONTENT_TYPES.JSON,
                data, StreamMessage.SIGNATURE_TYPES.ETH, wrongSignature,
            )
            assert.strictEqual(Signer.verifyStreamMessage(wrongStreamMessage, new Set([signer.address.toLowerCase()])), false)
        })
        it('Should return false if correct signature but not from a trusted publisher', () => {
            const signedStreamMessage = new StreamMessageV30(
                [streamId, 0, timestamp, 0, signer.address, ''], [timestamp - 10, 0], StreamMessage.CONTENT_TYPES.JSON,
                data, StreamMessage.SIGNATURE_TYPES.ETH, correctSignatureV30,
            )
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage, new Set()), false)
        })
    })
})
