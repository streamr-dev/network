import { createStreamMessage } from '../utils'
import { ContentMessage, StreamMessageType } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { StreamMessageTranslator } from '../../src/logic/protocol-integration/stream-message/StreamMessageTranslator'
import {
    EncryptionType,
    MessageID,
    StreamID,
    StreamMessage as OldStreamMessage,
    StreamMessageType as OldStreamMessageType
} from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'

describe('StreamMessageTranslator', () => {

    const content: ContentMessage = {
        body: JSON.stringify({ hello: "WORLD" })
    }
    const protobufMsg = createStreamMessage(content, 'TEST', 'publisher')

    const messageId =  new MessageID(
        'TEST' as StreamID,
        0,
        Date.now(),
        0,
        'publisher' as EthereumAddress,
        'test',
    )

    const oldProtocolMsg = new OldStreamMessage({
        messageId,
        prevMsgRef: null,
        content: { hello: "WORLD" },
        messageType: OldStreamMessageType.MESSAGE,
        encryptionType: EncryptionType.NONE,
        signature: 'signature',
    })

    it('translates old protocol to protobuf', () => {
        const translated = StreamMessageTranslator.toProtobuf(oldProtocolMsg)
        expect(translated.messageRef!.timestamp).toBeGreaterThanOrEqual(0)
        expect(translated.messageRef!.sequenceNumber).toEqual(0)
        expect(translated.messageRef!.streamId).toEqual('TEST')
        expect(translated.messageRef!.streamPartition).toEqual(0)
        expect(translated.messageRef!.publisherId).toEqual('publisher')
        expect(translated.previousMessageRef).toEqual(undefined)
        expect(translated.messageType).toEqual(StreamMessageType.MESSAGE)
        expect(translated.groupKeyId).toEqual(undefined)
        expect(translated.signature).toEqual('signature')
        expect(JSON.parse(ContentMessage.fromBinary(translated.content).body)).toEqual({ hello: "WORLD" })

    })

    it('translates protobuf to old protocol', () => {
        const translated = StreamMessageTranslator.toClientProtocol(protobufMsg)
        expect(translated.messageId.timestamp).toBeGreaterThanOrEqual(0)
        expect(translated.messageId.sequenceNumber).toEqual(0)
        expect(translated.messageId.streamId).toEqual('TEST')
        expect(translated.messageId.streamPartition).toEqual(0)
        expect(translated.getPublisherId()).toEqual('publisher')
        expect(translated.prevMsgRef).toEqual(null)
        expect(translated.messageType).toEqual(OldStreamMessageType.MESSAGE)
        expect(translated.contentType).toEqual(0)
        expect(translated.groupKeyId).toEqual(null)
        expect(translated.signature).toEqual('signature')
        expect(translated.getParsedContent()).toEqual({ hello: "WORLD" })
    })
})
