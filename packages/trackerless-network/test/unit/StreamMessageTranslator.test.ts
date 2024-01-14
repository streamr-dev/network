import {
    EncryptionType,
    MessageID,
    StreamMessage as OldStreamMessage,
    StreamMessageType as OldStreamMessageType,
    StreamPartIDUtils,
    ContentType,
    SignatureType
} from '@streamr/protocol'
import { binaryToHex, binaryToUtf8, hexToBinary, toEthereumAddress, utf8ToBinary } from '@streamr/utils'
import { StreamMessageTranslator } from '../../src/logic/protocol-integration/stream-message/StreamMessageTranslator'
import { StreamMessageType } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createStreamMessage } from '../utils/utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('TEST#0')

describe('StreamMessageTranslator', () => {

    const publisherId = toEthereumAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    const signature = hexToBinary('0x1234')
    const protobufMsg = createStreamMessage(
        JSON.stringify({ hello: 'WORLD' }),
        STREAM_PART_ID,
        publisherId
    )
    const messageId = new MessageID(
        StreamPartIDUtils.getStreamID(STREAM_PART_ID),
        StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
        Date.now(),
        0,
        publisherId,
        'test',
    )
    const oldProtocolMsg = new OldStreamMessage({
        messageId,
        prevMsgRef: null,
        content: utf8ToBinary(JSON.stringify({ hello: 'WORLD' })),
        contentType: ContentType.JSON,
        messageType: OldStreamMessageType.MESSAGE,
        encryptionType: EncryptionType.NONE,
        signatureType: SignatureType.SECP256K1,
        signature,
    })

    it('translates old protocol to protobuf', () => {
        const translated = StreamMessageTranslator.toProtobuf(oldProtocolMsg)
        expect(translated.messageId!.streamId).toEqual(StreamPartIDUtils.getStreamID(STREAM_PART_ID))
        expect(translated.messageId!.streamPartition).toEqual(StreamPartIDUtils.getStreamPartition(STREAM_PART_ID))
        expect(translated.messageId!.timestamp).toBeGreaterThanOrEqual(0)
        expect(translated.messageId!.sequenceNumber).toEqual(0)
        expect(binaryToHex(translated.messageId!.publisherId, true)).toEqual('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        expect(translated.previousMessageRef).toEqual(undefined)
        expect(translated.messageType).toEqual(StreamMessageType.MESSAGE)
        expect(translated.groupKeyId).toEqual(undefined)
        expect(translated.signature).toStrictEqual(signature)
        expect(JSON.parse(binaryToUtf8(translated.content))).toEqual({ hello: 'WORLD' })
    })

    it('translates protobuf to old protocol', () => {
        const translated = StreamMessageTranslator.toClientProtocol(protobufMsg)
        expect(translated.messageId.streamId).toEqual(StreamPartIDUtils.getStreamID(STREAM_PART_ID))
        expect(translated.messageId.streamPartition).toEqual(StreamPartIDUtils.getStreamPartition(STREAM_PART_ID))
        expect(translated.messageId.timestamp).toBeGreaterThanOrEqual(0)
        expect(translated.messageId.sequenceNumber).toEqual(0)
        expect(translated.getPublisherId()).toEqual('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        expect(translated.prevMsgRef).toEqual(null)
        expect(translated.messageType).toEqual(OldStreamMessageType.MESSAGE)
        expect(translated.contentType).toEqual(0)
        expect(translated.groupKeyId).toEqual(null)
        expect(translated.signature).toStrictEqual(signature)
        expect(translated.getParsedContent()).toEqual({ hello: 'WORLD' })
    })
})
