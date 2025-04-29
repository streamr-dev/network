import {
    ContentType,
    EncryptionType,
    StreamMessage as ProtoStreamMessage,
    SignatureType,
} from '@streamr/trackerless-network'
import {
    StreamPartID,
    StreamPartIDUtils,
    UserID,
    hexToBinary,
    toUserIdRaw,
    utf8ToBinary
} from '@streamr/utils'
import { MessageID as OldMessageID } from '../../src/protocol/MessageID'
import {
    StreamMessage,
    StreamMessageType
} from '../../src/protocol/StreamMessage'
import { StreamMessageTranslator } from '../../src/protocol/StreamMessageTranslator'
import { randomUserId } from '@streamr/test-utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('TEST#0')

const createStreamMessage = (
    content: string,
    streamPartId: StreamPartID,
    publisherId: UserID,
    timestamp?: number,
    sequenceNumber?: number
): ProtoStreamMessage => {
    const messageId = {
        streamId: StreamPartIDUtils.getStreamID(streamPartId),
        streamPartition: StreamPartIDUtils.getStreamPartition(streamPartId),
        sequenceNumber: sequenceNumber ?? 0,
        timestamp: timestamp ?? Date.now(),
        publisherId: hexToBinary(publisherId),
        messageChainId: 'messageChain0',
    }
    const msg = {
        messageId,
        signatureType: SignatureType.ECDSA_SECP256K1_EVM,
        signature: hexToBinary('0x1234'),
        body: {
            oneofKind: 'contentMessage' as const,
            contentMessage: {
                encryptionType: EncryptionType.NONE,
                contentType: ContentType.JSON,
                content: utf8ToBinary(content)
            }
        }
    }
    return msg
}

describe('StreamMessageTranslator', () => {

    const publisherId = randomUserId()
    const signature = hexToBinary('0x1234')
    const protobufMsg = createStreamMessage(
        JSON.stringify({ hello: 'WORLD' }),
        STREAM_PART_ID,
        publisherId
    )
    const messageId = new OldMessageID(
        StreamPartIDUtils.getStreamID(STREAM_PART_ID),
        StreamPartIDUtils.getStreamPartition(STREAM_PART_ID),
        Date.now(),
        0,
        publisherId,
        'test',
    )
    const oldProtocolMsg = new StreamMessage({
        messageId,
        content: utf8ToBinary(JSON.stringify({ hello: 'WORLD' })),
        contentType: ContentType.JSON,
        messageType: StreamMessageType.MESSAGE,
        encryptionType: EncryptionType.NONE,
        signatureType: SignatureType.ECDSA_SECP256K1_EVM,
        signature,
    })

    it('translates old protocol to protobuf', () => {
        const translated = StreamMessageTranslator.toProtobuf(oldProtocolMsg)
        expect(translated.messageId!.streamId).toEqual(StreamPartIDUtils.getStreamID(STREAM_PART_ID))
        expect(translated.messageId!.streamPartition).toEqual(StreamPartIDUtils.getStreamPartition(STREAM_PART_ID))
        expect(translated.messageId!.timestamp).toBeGreaterThanOrEqual(0)
        expect(translated.messageId!.sequenceNumber).toEqual(0)
        expect(translated.messageId!.publisherId).toEqualBinary(toUserIdRaw(publisherId))
        expect(translated.previousMessageRef).toEqual(undefined)
        expect(translated.body.oneofKind).toEqual('contentMessage')
        expect((translated.body as any).contentMessage.groupKeyId).toEqual(undefined)
        expect(translated.signature).toStrictEqual(signature)
        expect((translated.body as any).contentMessage.content).toEqualBinary(utf8ToBinary(JSON.stringify({ hello: 'WORLD' })))
    })

    it('translates protobuf to old protocol', () => {
        const translated = StreamMessageTranslator.toClientProtocol(protobufMsg)
        expect(translated.messageId.streamId).toEqual(StreamPartIDUtils.getStreamID(STREAM_PART_ID))
        expect(translated.messageId.streamPartition).toEqual(StreamPartIDUtils.getStreamPartition(STREAM_PART_ID))
        expect(translated.messageId.timestamp).toBeGreaterThanOrEqual(0)
        expect(translated.messageId.sequenceNumber).toEqual(0)
        expect(translated.getPublisherId()).toEqual(publisherId)
        expect(translated.prevMsgRef).toEqual(undefined)
        expect(translated.messageType).toEqual(StreamMessageType.MESSAGE)
        expect(translated.contentType).toEqual(0)
        expect(translated.groupKeyId).toEqual(undefined)
        expect(translated.signature).toStrictEqual(signature)
        expect(translated.getParsedContent()).toEqual({ hello: 'WORLD' })
    })
})
