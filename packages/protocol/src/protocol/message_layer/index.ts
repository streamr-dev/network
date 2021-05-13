import MessageID from "./MessageID"
import MessageIDStrict from "./MessageIDStrict"
import MessageRef from "./MessageRef"
import MessageRefStrict from "./MessageRefStrict"
import StreamMessage from "./StreamMessage"
import { StreamMessageType } from "./StreamMessage"
import GroupKeyMessage from "./GroupKeyMessage"
import GroupKeyRequest from "./GroupKeyRequest"
import GroupKeyResponse from "./GroupKeyResponse"
import GroupKeyAnnounce from "./GroupKeyAnnounce"
import GroupKeyErrorResponse from "./GroupKeyErrorResponse"
import EncryptedGroupKey from "./EncryptedGroupKey"

// Serializers are imported because of their side effects: they statically register themselves to the factory class
import './StreamMessageSerializerV30'
import './StreamMessageSerializerV31'
import './StreamMessageSerializerV32'

export {
    MessageID,
    MessageIDStrict,
    MessageRef,
    MessageRefStrict,
    StreamMessage,
    StreamMessageType,
    GroupKeyMessage,
    GroupKeyRequest,
    GroupKeyResponse,
    GroupKeyAnnounce,
    GroupKeyErrorResponse,
    EncryptedGroupKey,
}
