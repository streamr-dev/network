import InstructionMessage from "./instruction_message/InstructionMessage"
import ErrorMessage from "./error_message/ErrorMessage"
import RelayMessage from "./relay_message/RelayMessage"
import StatusMessage from "./status_message/StatusMessage"
import StorageNodesRequest from "./storage_nodes_request/StorageNodesRequest"
import StorageNodesResponse from "./storage_nodes_response/StorageNodesResponse"
import TrackerMessage from "./TrackerMessage"
import { TrackerMessageType } from "./TrackerMessage"
import { Originator } from "./Originator"

// Serializers are imported because of their side effects: they statically register themselves to the factory class
import './error_message/ErrorMessageSerializerV1'
import './instruction_message/InstructionMessageSerializerV1'
import './relay_message/RelayMessageSerializerV1'
import './status_message/StatusMessageSerializerV1'
import './storage_nodes_request/StorageNodesRequestSerializerV1'
import './storage_nodes_response/StorageNodesResponseSerializerV1'

export {
    InstructionMessage,
    ErrorMessage,
    RelayMessage,
    StatusMessage,
    StorageNodesRequest,
    StorageNodesResponse,
    TrackerMessage,
    TrackerMessageType,
    Originator
}
