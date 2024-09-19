import { hexToBinary, toStreamID } from '@streamr/utils'
import { convertBytesToStreamMessage, convertStreamMessageToBytes } from '../../src/protocol/oldStreamMessageBinaryUtils'
import { MessageID } from './../../src/protocol/MessageID'
import { MessageRef } from './../../src/protocol/MessageRef'
import { ContentType, EncryptionType, SignatureType, StreamMessage } from './../../src/protocol/StreamMessage'

describe('oldStreamMessageBinaryUtils', () => {
    it('convertStreamMessageToBytes and convertBytesToStreamMessage', () => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID(
                toStreamID('test.ens/foobar'),
                0,
                10001,
                0,
                hexToBinary('0x1234567890123456789012345678901234567890'),
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
        expect(convertedStreamMessage).toMatchObject({
            messageId: {
                streamId: toStreamID('test.ens/foobar'),
                streamPartition: 0,
                timestamp: 10001,
                sequenceNumber: 0,
                publisherId: expect.toEqualBinary(hexToBinary('0x1234567890123456789012345678901234567890')),
                msgChainId: 'msgChainId'
            },
            prevMsgRef: {
                timestamp: 10000,
                sequenceNumber: 1
            },
            content: expect.toEqualBinary(new Uint8Array([1, 2, 3])),
            contentType: ContentType.BINARY,
            encryptionType: EncryptionType.NONE,
            groupKeyId: '0x1234567890123456789012345678901234567890',
            signatureType: SignatureType.SECP256K1,
            signature: expect.toEqualBinary(new Uint8Array([7, 8, 9]))
        })
    })
})
