import {
    ContentType,
    EncryptionType,
    MessageID,
    MessageRef,
    SignatureType,
    StreamMessage,
    StreamMessageType,
    toStreamID
} from '@streamr/protocol'
import { hexToBinary, toEthereumAddress, utf8ToBinary } from '@streamr/utils'
import { assertSignatureIsValid } from '../../src/utils/validateStreamMessage'

describe('signature', () => {

    describe('SECP256K1', () => {

        it('unencrypted message passes signature validation', () => {
            const message = new StreamMessage({
                messageId: new MessageID(
                    toStreamID('streamr.eth/foo/bar'),
                    0,
                    1704972511765,
                    0,
                    toEthereumAddress('0x27dfD6a6Da01d10626e2391337Ca8e15Ea085686'),
                    '401zi3b84sd64qn31fte'
                ),
                prevMsgRef: new MessageRef(1704972444019, 0),
                content: utf8ToBinary('{"foo":"bar"}'),
                messageType: StreamMessageType.MESSAGE,
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.NONE,
                // eslint-disable-next-line max-len
                signature: hexToBinary('8c24d09ea136c51dc9988c74d17eb3bfb8ab84d375605b0307e50a4bbe962365054914808e96ceec98ba1f0bcfe4bbc9a57ea18c0bace40b7ba691f8dcdb209b1c'),
                signatureType: SignatureType.SECP256K1
            })
            expect(() => assertSignatureIsValid(message)).not.toThrow()
        })

        it('encrypted message passes signature validation', () => {
            const message = new StreamMessage({
                messageId : new MessageID(
                    toStreamID('streamr.eth/encrypt-test'),
                    0,
                    1704972170055,
                    0,
                    toEthereumAddress('0x27dfD6a6Da01d10626e2391337Ca8e15Ea085686'),
                    'vGDg4KzqASGpHCrG6Qao'
                ),
                prevMsgRef: new MessageRef(1704972169554, 0),
                // eslint-disable-next-line max-len
                content: hexToBinary('d6840ee7ef8caf90b5d9a9109666cea67e6bc2984a840cc8bea5355e5911b4d1dce82af42110aef0f54dd39f3f02ee51e11c111318eac7c5bb39acbe77b40add0796994b2f627498705c79e001625af102518a9c302389c6da59bfd2b18cb483342cfc0cd838b0faeae9dcfba0dc146ae227e4b6c7b3c10e8848aa4ed6061eafcf6cba8ee0e843b72bcc6e79108373879e9a72a0765548167695e137a462ae7db09c3b70ae12609cda86150ee5066098830dda9af019a8629cdfbc5f2227f9b29c51a87471bc9b6f19956b7a8b17eab87419345b2d9a1f4820d6a0ca5a74c379dba9da030f7ce91b7c0bf52cf73cd3a8fe2c8bb1baee7d0748f3f4004907a51a64d75eb974711cbaa1c86311737a17ce10c8647f'),
                messageType: StreamMessageType.MESSAGE,
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.AES,
                // eslint-disable-next-line max-len
                signature: hexToBinary('7df1335e0951ca3fa0dfec0e54bac904bd4e63d56d18292c221e9f095fa6067e58d7fc2851e044fac4673442e14ded35dda9295a7a92a939df5abe1ffb27a6401b'),
                groupKeyId: '4717fdf7-3cb7-4819-95fc-21122409e630-GroupKey1',
                signatureType: SignatureType.SECP256K1
            })
            expect(() => assertSignatureIsValid(message)).not.toThrow()
        })
  
    })

    /**
     * This test is for the legacy signature format, which is still supported for backwards compatibility.
     *
     * It should be noted that old stream messages (from Brubeck) cannot be used as-is without converting the
     * content and the signature fields. (Also the serialization format has drastically changed.)
     *
     * The signature is a hex-encoded string in the old format, the new format uses binary and this
     * is a straightforward conversion with `hexToBinary()`.
     *
     * The content is a string in the old format, the new format uses binary. This conversion is dependent on the encryption
     * type. If the content was encrypted, it was hex-encoded, so it can be converted with `hexToBinary()`. If the content
     * was not encrypted, it was a string, so it can be converted with `utf8ToBinary()`.
     *
     * Notice that the legacy signature format never coincides with binary content type since that did not exist back then.
     * Or simply put, whenever we have legacy signature, we have JSON content type.
     *
     */
    describe('LEGACY_SECP256K1', () => {

        it('unencrypted message passes signature validation', () => {
            const message = new StreamMessage({
                messageId: new MessageID(
                    toStreamID('streamr.eth/metrics/nodes/firehose/min'),
                    0,
                    1704972511765,
                    0,
                    toEthereumAddress('0xbd968096c7f0a363212e9bb524890ac1ea2c2af9'),
                    '401zi3b84sd64qn31fte'
                ),
                prevMsgRef: new MessageRef(1704972444019, 0),
                // eslint-disable-next-line max-len
                content: utf8ToBinary('{"period":{"start":1704972420000,"end":1704972480000},"broker":{"messagesToNetworkPerSec":0,"bytesToNetworkPerSec":0},"network":{"avgLatencyMs":24883.619242257042,"bytesToPeersPerSec":965.2666666666668,"bytesFromPeersPerSec":0,"connections":7.333333333333333,"webRtcConnectionFailures":4}}'),
                messageType: StreamMessageType.MESSAGE,
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.NONE,
                // eslint-disable-next-line max-len
                signature: hexToBinary('0x738f682914f224522030fb6520f51cff14581904d981268d182936f0f42d832935e970f775f78ccbba053261916215b7742407aae4bdd49777a7bcf8954ee8401c'),
                signatureType: SignatureType.LEGACY_SECP256K1
            })
            expect(() => assertSignatureIsValid(message)).not.toThrow()
        })

        it('encrypted message passes signature validation', () => {
            const message = new StreamMessage({
                messageId : new MessageID(
                    toStreamID('0x0472476943d7570b368e2a02123321518568a66e/encrypt-test'),
                    0,
                    1704972170055,
                    0,
                    toEthereumAddress('0x0472476943d7570b368e2a02123321518568a66e'),
                    'vGDg4KzqASGpHCrG6Qao'
                ),
                prevMsgRef: new MessageRef(1704972169554, 0),
                // eslint-disable-next-line max-len
                content: hexToBinary('d6840ee7ef8caf90b5d9a9109666cea67e6bc2984a840cc8bea5355e5911b4d1dce82af42110aef0f54dd39f3f02ee51e11c111318eac7c5bb39acbe77b40add0796994b2f627498705c79e001625af102518a9c302389c6da59bfd2b18cb483342cfc0cd838b0faeae9dcfba0dc146ae227e4b6c7b3c10e8848aa4ed6061eafcf6cba8ee0e843b72bcc6e79108373879e9a72a0765548167695e137a462ae7db09c3b70ae12609cda86150ee5066098830dda9af019a8629cdfbc5f2227f9b29c51a87471bc9b6f19956b7a8b17eab87419345b2d9a1f4820d6a0ca5a74c379dba9da030f7ce91b7c0bf52cf73cd3a8fe2c8bb1baee7d0748f3f4004907a51a64d75eb974711cbaa1c86311737a17ce10c8647f'),
                messageType: StreamMessageType.MESSAGE,
                contentType: ContentType.JSON,
                encryptionType: EncryptionType.AES,
                // eslint-disable-next-line max-len
                signature: hexToBinary('0x522e1dca3f3cdc5d1e847280cc0d3d09ddb71bd905750ba69cb07861544421811869648cdd7884f422385ba81dad8ab63b02892d20faaabc295ebeb3e4d90bcf1c'),
                groupKeyId: '4717fdf7-3cb7-4819-95fc-21122409e630-GroupKey1',
                signatureType: SignatureType.LEGACY_SECP256K1
            })
            expect(() => assertSignatureIsValid(message)).not.toThrow()
        })
    })
})