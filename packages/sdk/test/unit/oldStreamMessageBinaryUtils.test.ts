import { randomUserId } from '@streamr/test-utils'
import { toStreamID } from '@streamr/utils'
import { convertBytesToStreamMessage, convertStreamMessageToBytes } from '../../src/protocol/oldStreamMessageBinaryUtils'
import { MessageID } from './../../src/protocol/MessageID'
import { MessageRef } from './../../src/protocol/MessageRef'
import { StreamMessage } from './../../src/protocol/StreamMessage'
import { ContentType, EncryptionType, SignatureType } from '@streamr/trackerless-network'

describe('oldStreamMessageBinaryUtils', () => {
    it('convertStreamMessageToBytes and convertBytesToStreamMessage', () => {
        const streamMessage = new StreamMessage({
            messageId: new MessageID(
                toStreamID('test.ens/foobar'),
                0,
                10001,
                0,
                randomUserId(),
                'msgChainId'
            ),
            prevMsgRef: new MessageRef(10000, 1),
            content: new Uint8Array([1, 2, 3]),
            contentType: ContentType.BINARY,
            encryptionType: EncryptionType.NONE,
            groupKeyId: '0x1234567890123456789012345678901234567890',
            signatureType: SignatureType.ECDSA_SECP256K1_EVM,
            signature: new Uint8Array([7, 8, 9])
        })

        const bytes = convertStreamMessageToBytes(streamMessage)
        expect(bytes).toBeInstanceOf(Uint8Array)
        expect(bytes.length).toBeGreaterThan(100)
        const convertedStreamMessage = convertBytesToStreamMessage(bytes)
        expect(convertedStreamMessage).toEqual(streamMessage)
    })
})
