import { 
    StreamMessage as OldStreamMessage,
    GroupKeyRequest as OldGroupKeyRequest,
    GroupKeyResponse as OldGroupKeyResponse
} from '@streamr/protocol'
import { StreamMessageTranslator } from './StreamMessageTranslator'
import {
    StreamMessage,
    GroupKeyRequest,
    GroupKeyResponse
} from '../../../proto/packages/trackerless-network/protos/NetworkRpc'
import { GroupKeyResponseTranslator } from './GroupKeyResponseTranslator'
import { GroupKeyRequestTranslator } from './GroupKeyRequestTranslator'

export function convertStreamMessageToBytes(oldStreamMessage: OldStreamMessage): Uint8Array {
    return StreamMessage.toBinary(StreamMessageTranslator.toProtobuf(oldStreamMessage))
}

export function convertBytesToStreamMessage(bytes: Uint8Array): OldStreamMessage {
    return StreamMessageTranslator.toClientProtocol(StreamMessage.fromBinary(bytes))
}

export const convertGroupKeyRequestToBytes = (oldGroupKeyRequest: OldGroupKeyRequest): Uint8Array => {
    return GroupKeyRequest.toBinary(GroupKeyRequestTranslator.toProtobuf(oldGroupKeyRequest))
}

export const convertBytesToGroupKeyRequest = (bytes: Uint8Array): OldGroupKeyRequest => {
    return GroupKeyRequestTranslator.toClientProtocol(GroupKeyRequest.fromBinary(bytes))
}

export const convertGroupKeyResponseToBytes = (oldGroupKeyResponse: OldGroupKeyResponse): Uint8Array => {
    return GroupKeyResponse.toBinary(GroupKeyResponseTranslator.toProtobuf(oldGroupKeyResponse))
}

export const convertBytesToGroupKeyResponse = (bytes: Uint8Array): OldGroupKeyResponse => {
    return GroupKeyResponseTranslator.toClientProtocol(GroupKeyResponse.fromBinary(bytes))
}
