import { createStreamMessage } from '../utils/utils'
import { StreamMessageType } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { StreamMessageTranslator } from '../../src/logic/protocol-integration/stream-message/StreamMessageTranslator'
import {
    EncryptionType,
    MessageID,
    StreamID,
    StreamMessage as OldStreamMessage,
    StreamMessageType as OldStreamMessageType
} from '@streamr/protocol'
import { EthereumAddress } from '@streamr/utils'
import { toBinary, toUTF8 } from '../../src/logic/utils'

describe('StreamMessageTranslator', () => {

    const protobufMsg = createStreamMessage(
        JSON.stringify({ hello: 'WORLD' }),
        'TEST',
        toBinary('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    )
    const messageId = new MessageID(
        'TEST' as StreamID,
        0,
        Date.now(),
        0,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as EthereumAddress,
        'test',
    )
    const oldProtocolMsg = new OldStreamMessage({
        messageId,
        prevMsgRef: null,
        content: { hello: 'WORLD' },
        messageType: OldStreamMessageType.MESSAGE,
        encryptionType: EncryptionType.NONE,
        signature: 'signature',
    })

    it('translates old protocol to protobuf', () => {
        const translated = StreamMessageTranslator.toProtobuf(oldProtocolMsg)
        expect(translated.messageId!.timestamp).toBeGreaterThanOrEqual(0)
        expect(translated.messageId!.sequenceNumber).toEqual(0)
        expect(translated.messageId!.streamId).toEqual('TEST')
        expect(translated.messageId!.streamPartition).toEqual(0)
        expect(toUTF8(translated.messageId!.publisherId)).toEqual('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        expect(translated.previousMessageRef).toEqual(undefined)
        expect(translated.messageType).toEqual(StreamMessageType.MESSAGE)
        expect(translated.groupKeyId).toEqual(undefined)
        expect(toUTF8(translated.signature)).toEqual('signature')
        expect(JSON.parse(toUTF8(translated.content))).toEqual({ hello: 'WORLD' })

    })

    it('translates protobuf to old protocol', () => {
        const translated = StreamMessageTranslator.toClientProtocol(protobufMsg)
        expect(translated.messageId.timestamp).toBeGreaterThanOrEqual(0)
        expect(translated.messageId.sequenceNumber).toEqual(0)
        expect(translated.messageId.streamId).toEqual('TEST')
        expect(translated.messageId.streamPartition).toEqual(0)
        expect(translated.getPublisherId()).toEqual('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
        expect(translated.prevMsgRef).toEqual(null)
        expect(translated.messageType).toEqual(OldStreamMessageType.MESSAGE)
        expect(translated.contentType).toEqual(0)
        expect(translated.groupKeyId).toEqual(null)
        expect(translated.signature).toEqual('signature')
        expect(translated.getParsedContent()).toEqual({ hello: 'WORLD' })
    })
})
