import {
    ContentType,
    EncryptionType,
    MessageID,
    MessageRef,
    SignatureType,
    StreamMessage,
    toStreamID
} from '@streamr/protocol'
import { toEthereumAddress } from '@streamr/utils'
import { convertBytesToStreamMessage, convertStreamMessageToBytes } from '../../src/exports'

describe('oldStreamMessageBinaryUtils', () => {
    it('convertStreamMessageToBytes and convertBytesToStreamMessage', () => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID(
                toStreamID('test.ens/foobar'),
                0,
                10001,
                0,
                toEthereumAddress('0x1234567890123456789012345678901234567890'),
                'msgChainId'
            ),
            prevMsgRef: new MessageRef(10000, 1),
            content: new Uint8Array([1, 2, 3]),
            contentType: ContentType.BINARY,
            encryptionType: EncryptionType.NONE,
            groupKeyId: '0x1234567890123456789012345678901234567890',
            signatureType: SignatureType.SECP256K1,
            signature: new Uint8Array([7, 8, 9])
        })

        const bytes = convertStreamMessageToBytes(streamMessage)
        expect(bytes).toBeInstanceOf(Uint8Array)
        expect(bytes.length).toBeGreaterThan(100)
        const convertedStreamMessage = convertBytesToStreamMessage(bytes)
        expect(convertedStreamMessage).toEqual(streamMessage)
    })
})
