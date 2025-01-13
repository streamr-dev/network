import {
    GroupKeyRequest as NewGroupKeyRequest,
    GroupKeyResponse as NewGroupKeyResponse,
    StreamMessage as NewStreamMessage
} from '@streamr/trackerless-network'
import { GroupKeyRequest as OldGroupKeyRequest } from './GroupKeyRequest'
import { GroupKeyRequestTranslator } from './GroupKeyRequestTranslator'
import { GroupKeyResponse as OldGroupKeyResponse } from './GroupKeyResponse'
import { GroupKeyResponseTranslator } from './GroupKeyResponseTranslator'
import { StreamMessage as OldStreamMessage } from './StreamMessage'
import { StreamMessageTranslator } from './StreamMessageTranslator'

export function convertStreamMessageToBytes(oldStreamMessage: OldStreamMessage): Uint8Array {
    return NewStreamMessage.toBinary(StreamMessageTranslator.toProtobuf(oldStreamMessage))
}

export function convertBytesToStreamMessage(bytes: Uint8Array): OldStreamMessage {
    return StreamMessageTranslator.toClientProtocol(NewStreamMessage.fromBinary(bytes))
}

export const convertGroupKeyRequestToBytes = (oldGroupKeyRequest: OldGroupKeyRequest): Uint8Array => {
    return NewGroupKeyRequest.toBinary(GroupKeyRequestTranslator.toProtobuf(oldGroupKeyRequest))
}

export const convertBytesToGroupKeyRequest = (bytes: Uint8Array): OldGroupKeyRequest => {
    return GroupKeyRequestTranslator.toClientProtocol(NewGroupKeyRequest.fromBinary(bytes))
}

export const convertGroupKeyResponseToBytes = (oldGroupKeyResponse: OldGroupKeyResponse): Uint8Array => {
    return NewGroupKeyResponse.toBinary(GroupKeyResponseTranslator.toProtobuf(oldGroupKeyResponse))
}

export const convertBytesToGroupKeyResponse = (bytes: Uint8Array): OldGroupKeyResponse => {
    return GroupKeyResponseTranslator.toClientProtocol(NewGroupKeyResponse.fromBinary(bytes))
}
