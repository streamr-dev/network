import { StreamMessage as OldStreamMessage } from '@streamr/protocol'
import { StreamMessageTranslator } from './StreamMessageTranslator'
import { StreamMessage } from '../../../proto/packages/trackerless-network/protos/NetworkRpc'

export function convertStreamMessageToBytes(oldStreamMessage: OldStreamMessage): Uint8Array {
    return StreamMessage.toBinary(StreamMessageTranslator.toProtobuf(oldStreamMessage))
}

export function convertBytesToStreamMessage(bytes: Uint8Array): OldStreamMessage {
    return StreamMessageTranslator.toClientProtocol(StreamMessage.fromBinary(bytes))
}
