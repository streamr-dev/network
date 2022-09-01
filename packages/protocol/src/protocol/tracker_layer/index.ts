import InstructionMessage from "./instruction_message/InstructionMessage"
import ErrorMessage from "./error_message/ErrorMessage"
import RelayMessage, {
    RelayMessageSubType,
    RtcIceCandidateMessage,
    RtcConnectMessage,
    RtcOfferMessage,
    RtcAnswerMessage
} from "./relay_message/RelayMessage"
import StatusMessage from "./status_message/StatusMessage"
import UnicastMessage from './unicast_message/UnicastMessage'
import MulticastMessage from './multicast_message/MulticastMessage'
import TrackerMessage from "./TrackerMessage"
import { TrackerMessageType } from "./TrackerMessage"
import { Originator } from "./Originator"

// Serializers are imported because of their side effects: they statically register themselves to the factory class
import './error_message/ErrorMessageSerializerV2'
import './instruction_message/InstructionMessageSerializerV2'
import './relay_message/RelayMessageSerializerV2'
import './status_message/StatusMessageSerializerV2'
import './unicast_message/UnicastMessageSerializerV2'
import './multicast_message/MulticastMessageSerializerV2'

export {
    InstructionMessage,
    ErrorMessage,
    StatusMessage,
    TrackerMessage,
    TrackerMessageType,
    Originator,
    RelayMessage,
    RelayMessageSubType,
    RtcIceCandidateMessage,
    RtcConnectMessage,
    RtcOfferMessage,
    RtcAnswerMessage,
    UnicastMessage,
    MulticastMessage
}
