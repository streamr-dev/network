// Serializers are imported because of their side effects: they statically register themselves to the factory class
import BroadcastMessage from './protocol/control_layer/broadcast_message/BroadcastMessage'
import './protocol/control_layer/broadcast_message/BroadcastMessageSerializerV1'
import './protocol/control_layer/broadcast_message/BroadcastMessageSerializerV2'
import ErrorResponse from './protocol/control_layer/error_response/ErrorResponse'
import './protocol/control_layer/error_response/ErrorResponseSerializerV1'
import './protocol/control_layer/error_response/ErrorResponseSerializerV2'
import InstructionMessage from './protocol/tracker_layer/instruction_message/InstructionMessage'
import './protocol/tracker_layer/instruction_message/InstructionMessageSerializerV1'
import PublishRequest from './protocol/control_layer/publish_request/PublishRequest'
import './protocol/control_layer/publish_request/PublishRequestSerializerV1'
import './protocol/control_layer/publish_request/PublishRequestSerializerV2'
import ResendFromRequest from './protocol/control_layer/resend_request/ResendFromRequest'
import './protocol/control_layer/resend_request/ResendFromRequestSerializerV1'
import './protocol/control_layer/resend_request/ResendFromRequestSerializerV2'
import ResendLastRequest from './protocol/control_layer/resend_request/ResendLastRequest'
import './protocol/control_layer/resend_request/ResendLastRequestSerializerV1'
import './protocol/control_layer/resend_request/ResendLastRequestSerializerV2'
import ResendRangeRequest from './protocol/control_layer/resend_request/ResendRangeRequest'
import './protocol/control_layer/resend_request/ResendRangeRequestSerializerV1'
import './protocol/control_layer/resend_request/ResendRangeRequestSerializerV2'
import ResendResponseNoResend from './protocol/control_layer/resend_response/ResendResponseNoResend'
import './protocol/control_layer/resend_response/ResendResponseNoResendSerializerV1'
import './protocol/control_layer/resend_response/ResendResponseNoResendSerializerV2'
import ResendResponseResending from './protocol/control_layer/resend_response/ResendResponseResending'
import './protocol/control_layer/resend_response/ResendResponseResendingSerializerV1'
import './protocol/control_layer/resend_response/ResendResponseResendingSerializerV2'
import ResendResponseResent from './protocol/control_layer/resend_response/ResendResponseResent'
import StatusMessage from './protocol/tracker_layer/status_message/StatusMessage'
import './protocol/tracker_layer/status_message/StatusMessageSerializerV1'
import './protocol/control_layer/resend_response/ResendResponseResentSerializerV1'
import './protocol/control_layer/resend_response/ResendResponseResentSerializerV2'
import StorageNodesRequest from './protocol/tracker_layer/storage_nodes_request/StorageNodesRequest'
import './protocol/tracker_layer/storage_nodes_request/StorageNodesRequestSerializerV1'
import StorageNodesResponse from './protocol/tracker_layer/storage_nodes_response/StorageNodesResponse'
import './protocol/tracker_layer/storage_nodes_response/StorageNodesResponseSerializerV1'
import SubscribeRequest from './protocol/control_layer/subscribe_request/SubscribeRequest'
import './protocol/control_layer/subscribe_request/SubscribeRequestSerializerV1'
import './protocol/control_layer/subscribe_request/SubscribeRequestSerializerV2'
import SubscribeResponse from './protocol/control_layer/subscribe_response/SubscribeResponse'
import './protocol/control_layer/subscribe_response/SubscribeResponseSerializerV1'
import './protocol/control_layer/subscribe_response/SubscribeResponseSerializerV2'
import UnicastMessage from './protocol/control_layer/unicast_message/UnicastMessage'
import './protocol/control_layer/unicast_message/UnicastMessageSerializerV1'
import './protocol/control_layer/unicast_message/UnicastMessageSerializerV2'
import UnsubscribeRequest from './protocol/control_layer/unsubscribe_request/UnsubscribeRequest'
import './protocol/control_layer/unsubscribe_request/UnsubscribeRequestSerializerV1'
import './protocol/control_layer/unsubscribe_request/UnsubscribeRequestSerializerV2'
import UnsubscribeResponse from './protocol/control_layer/unsubscribe_response/UnsubscribeResponse'
import './protocol/control_layer/unsubscribe_response/UnsubscribeResponseSerializerV1'
import './protocol/control_layer/unsubscribe_response/UnsubscribeResponseSerializerV2'
import ControlMessage from './protocol/control_layer/ControlMessage'
import MessageID from './protocol/message_layer/MessageID'
import MessageRef from './protocol/message_layer/MessageRef'
import StreamMessage from './protocol/message_layer/StreamMessage'
import './protocol/message_layer/StreamMessageSerializerV30'
import './protocol/message_layer/StreamMessageSerializerV31'
import './protocol/message_layer/StreamMessageSerializerV32'
import InvalidJsonError from './errors/InvalidJsonError'
import UnsupportedVersionError from './errors/UnsupportedVersionError'
import GapFillFailedError from './errors/GapFillFailedError'
import ValidationError from './errors/ValidationError'
import * as TimestampUtil from './utils/TimestampUtil'
import OrderingUtil from './utils/OrderingUtil'
import SigningUtil from './utils/SigningUtil'
import StreamMessageValidator from './utils/StreamMessageValidator'
import CachingStreamMessageValidator from './utils/CachingStreamMessageValidator'
import { TrackerRegistry, getTrackerRegistryFromContract, createTrackerRegistry, fetchTrackers } from './utils/TrackerRegistry'
import MessageIDStrict from './protocol/message_layer/MessageIDStrict'
import MessageRefStrict from './protocol/message_layer/MessageRefStrict'
import GroupKeyMessage from './protocol/message_layer/GroupKeyMessage'
import GroupKeyRequest from './protocol/message_layer/GroupKeyRequest'
import GroupKeyResponse from './protocol/message_layer/GroupKeyResponse'
import GroupKeyAnnounce from './protocol/message_layer/GroupKeyAnnounce'
import GroupKeyErrorResponse from './protocol/message_layer/GroupKeyErrorResponse'
import EncryptedGroupKey from './protocol/message_layer/EncryptedGroupKey'
import TrackerMessage from './protocol/tracker_layer/TrackerMessage'

export const ControlLayer = {
    BroadcastMessage,
    ErrorResponse,
    PublishRequest,
    ResendFromRequest,
    ResendLastRequest,
    ResendRangeRequest,
    ResendResponseNoResend,
    ResendResponseResending,
    ResendResponseResent,
    SubscribeRequest,
    SubscribeResponse,
    UnicastMessage,
    UnsubscribeRequest,
    UnsubscribeResponse,
    ControlMessage,
}

export const MessageLayer = {
    MessageID,
    MessageIDStrict,
    MessageRef,
    MessageRefStrict,
    StreamMessage,
    GroupKeyMessage,
    GroupKeyRequest,
    GroupKeyResponse,
    GroupKeyAnnounce,
    GroupKeyErrorResponse,
    EncryptedGroupKey,
}

export const TrackerLayer = {
    InstructionMessage,
    StatusMessage,
    StorageNodesRequest,
    StorageNodesResponse,
    TrackerMessage
}

export const Errors = {
    InvalidJsonError,
    UnsupportedVersionError,
    GapFillFailedError,
    ValidationError,
}

export const Utils = {
    TimestampUtil,
    OrderingUtil,
    StreamMessageValidator,
    CachingStreamMessageValidator,
    SigningUtil,
    TrackerRegistry,
    getTrackerRegistryFromContract,
    createTrackerRegistry,
    fetchTrackers
}

export default {
    ControlLayer,
    MessageLayer,
    Errors,
    Utils,
}
