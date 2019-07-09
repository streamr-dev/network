import assert from 'assert'

import { MessageLayer } from 'streamr-client-protocol'

import Signer from '../../src/Signer'

const { StreamMessage, StreamMessageV31, StreamMessageV30, StreamMessageV29 } = MessageLayer
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
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'auto')
            assert(signer instanceof Signer)
        })
        it('Should return a Signer when "always" option is set with private key', () => {
            const signer = Signer.createSigner({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            }, 'always')
            assert(signer instanceof Signer)
        })
        it('Should throw when "always" option is set with no private key or provider', () => {
            assert.throws(() => Signer.createSigner({}, 'always'), /Error/)
        })
        it('Should throw when unknown option is set', () => {
            assert.throws(() => Signer.createSigner({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
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
        const correctSignatureV29 = '0xb922018e12b520491593718812b234539f43ec8cec68edce0920582f655b76'
            + 'be0dd3c91dff706572ab378dc12da9df3373641267558685e0daa6ff8b2b0dec991c'
        const correctSignatureV30AndV31 = '0x62b340bd136726195f9ee9ea58d9e2a58aab48f89c80f5c6d107e87143bf3c'
            + 'f853ec65e87b38712a2e0f051b62fc2d3064e693df5a46fade3619e592681ad8de1c'
        const wrongSignature = '0x3d5c221ebed6bf75ecd0ca8751aa18401ac60561034e3b2889dfd7bbc0a2ff3c5f1'
            + 'c5239113f3fac5b648ab665d152ecece1daaafdd3d94309c2b822ec28369e1c'
        beforeEach(() => {
            signer = new Signer({
                privateKey: '0x348ce564d427a3311b6536bbcff9390d69395b06ed6c486954e971d960fe8709',
            })
        })
        it('should return correct signature', async () => {
            const payload = 'data-to-sign'
            const signature = await signer.signData(payload)
            assert.deepEqual(signature, '0x084b3ac0f2ad17d387ca5bbf5d72d8f1dfd1b372e399ce6b0bfc60793e'
                + 'b717d2431e498294f202d8dfd9f56158391d453c018470aea92ed6a80a23c20ab6f7ac1b')
        })
        it('should sign StreamMessageV31 with null previous ref correctly', async () => {
            const streamMessage = new StreamMessageV31(
                [streamId, 0, timestamp, 0, '', 'chain-id'], null, StreamMessage.CONTENT_TYPES.MESSAGE,
                StreamMessage.ENCRYPTION_TYPES.NONE, data, StreamMessage.SIGNATURE_TYPES.ETH, null,
            )
            const payload = streamMessage.getStreamId() + streamMessage.getStreamPartition() + streamMessage.getTimestamp()
                + streamMessage.messageId.sequenceNumber + signer.address.toLowerCase() + streamMessage.messageId.msgChainId
                + streamMessage.getSerializedContent()
            const expectedSignature = await signer.signData(payload)
            await signer.signStreamMessage(streamMessage)
            assert.strictEqual(streamMessage.signature, expectedSignature)
            assert.strictEqual(streamMessage.getPublisherId(), signer.address)
            assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
        })
        it('should sign StreamMessageV31 with non-null previous ref correctly', async () => {
            const streamMessage = new StreamMessageV31(
                [streamId, 0, timestamp, 0, '', 'chain-id'], [timestamp - 10, 0], StreamMessage.CONTENT_TYPES.MESSAGE,
                StreamMessage.ENCRYPTION_TYPES.NONE, data, StreamMessage.SIGNATURE_TYPES.ETH, null,
            )
            const payload = streamMessage.getStreamId() + streamMessage.getStreamPartition() + streamMessage.getTimestamp()
                + streamMessage.messageId.sequenceNumber + signer.address.toLowerCase() + streamMessage.messageId.msgChainId
                + streamMessage.prevMsgRef.timestamp + streamMessage.prevMsgRef.sequenceNumber + streamMessage.getSerializedContent()
            const expectedSignature = await signer.signData(payload)
            await signer.signStreamMessage(streamMessage)
            assert.strictEqual(streamMessage.signature, expectedSignature)
            assert.strictEqual(streamMessage.getPublisherId(), signer.address)
            assert.strictEqual(streamMessage.signatureType, StreamMessage.SIGNATURE_TYPES.ETH)
        })
        it('Should verify correct signature (V31)', () => {
            const signedStreamMessage = new StreamMessageV31(
                [streamId, 0, timestamp, 0, signer.address, 'chain-id'], null, StreamMessage.CONTENT_TYPES.MESSAGE,
                StreamMessage.ENCRYPTION_TYPES.NONE, data, StreamMessage.SIGNATURE_TYPES.ETH, correctSignatureV30AndV31,
            )
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage), true)
        })
        it('Should verify correct signature (V30)', () => {
            const signedStreamMessage = new StreamMessageV30(
                [streamId, 0, timestamp, 0, signer.address, 'chain-id'], null, StreamMessage.CONTENT_TYPES.MESSAGE,
                data, StreamMessage.SIGNATURE_TYPES.ETH, correctSignatureV30AndV31,
            )
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage), true)
        })
        it('Should verify correct signature (V29 but was converted to v30 for the client)', () => {
            const signedStreamMessage = (new StreamMessageV29(
                streamId, 0, timestamp, 0, 0, 0, StreamMessage.CONTENT_TYPES.MESSAGE,
                data, StreamMessage.SIGNATURE_TYPES.ETH_LEGACY, signer.address, correctSignatureV29,
            )).toOtherVersion(30)
            assert.strictEqual(Signer.verifyStreamMessage(signedStreamMessage), true)
        })
        it('Should return false if incorrect signature (V31)', () => {
            const wrongStreamMessage = new StreamMessageV31(
                [streamId, 0, timestamp, 0, signer.address, ''], [timestamp - 10, 0], StreamMessage.CONTENT_TYPES.MESSAGE,
                StreamMessage.ENCRYPTION_TYPES.NONE, data, StreamMessage.SIGNATURE_TYPES.ETH, wrongSignature,
            )
            assert.strictEqual(Signer.verifyStreamMessage(wrongStreamMessage), false)
        })
    })
})
