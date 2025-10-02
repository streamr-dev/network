import {
    StreamMessage as NewStreamMessage
} from '@streamr/trackerless-network'
import { StreamMessage as OldStreamMessage, } from './StreamMessage'
import { StreamMessageTranslator } from './StreamMessageTranslator'

export function convertStreamMessageToBytes(oldStreamMessage: OldStreamMessage): Uint8Array {
    return NewStreamMessage.toBinary(StreamMessageTranslator.toProtobuf(oldStreamMessage))
}

export function convertBytesToStreamMessage(bytes: Uint8Array): OldStreamMessage {
    return StreamMessageTranslator.toClientProtocol(NewStreamMessage.fromBinary(bytes))
}
