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

/**
 * This test is for the legacy signature format, which is still supported for backwards compatibility.
 */
describe('legacy format', () => {
    it('unencrypted', () => {
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

    it('encrypted', () => {
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
